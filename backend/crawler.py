"""Phase 5a - the crawler. No LLM here, by design: crawling must work if Groq is down.

Approved sources only. Conditional GET, retries (inside safe_fetch), 3 MB cap,
1 req/s per host, at most `CRAWL_CONCURRENCY` fetches in flight. Content is hashed
and de-duplicated by URL and by hash; a changed document at the same URL is stored
as a new record marked [UPDATED].
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import urlparse

import feedparser
from sqlalchemy import select

import safe_fetch
from config import get_settings
from db import JobLog, Record, Source
from research import canonical_url_key, extract_text, normalise_url

logger = logging.getLogger("signalstack.crawler")
settings = get_settings()

MAX_ITEMS_PER_SOURCE = 8
MIN_TEXT_CHARS = 250


@dataclass
class SourceFetch:
    source_id: int
    status: str = "ok"  # ok | not_modified | error
    error: str | None = None
    http_status: int | None = None
    elapsed_ms: int = 0
    robots_blocked: bool = False
    etag: str | None = None
    last_modified: str | None = None
    items: list[dict] = field(default_factory=list)


def content_hash(text: str) -> str:
    normalised = re.sub(r"\s+", " ", (text or "").strip()).lower()
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()


def _parse_date(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (time.struct_time, tuple)) and len(value) >= 6:
        # feedparser gives published_parsed as a UTC struct_time
        return datetime(*value[:6], tzinfo=timezone.utc)
    try:
        from email.utils import parsedate_to_datetime

        parsed = parsedate_to_datetime(str(value))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _feed_items(source: Source) -> tuple[list[dict], str | None]:
    """Read a feed and return candidate items carrying their own text."""
    if not source.feed_url:
        return [], None
    try:
        response = safe_fetch.fetch(source.feed_url)
        parsed = feedparser.parse(response.content)
    except safe_fetch.FetchError as exc:
        return [], exc.as_detail()

    items: list[dict] = []
    for entry in getattr(parsed, "entries", [])[: MAX_ITEMS_PER_SOURCE * 2]:
        link = (getattr(entry, "link", "") or "").strip()
        if not link.startswith(("http://", "https://")):
            continue
        summary = getattr(entry, "summary", "") or ""
        if not summary:
            content = getattr(entry, "content", None)
            if content:
                summary = content[0].get("value", "")
        items.append(
            {
                "url": link,
                "title": (getattr(entry, "title", "") or "").strip()[:400],
                "feed_text": re.sub(r"<[^>]+>", " ", summary),
                "published": _parse_date(
                    getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
                ),
            }
        )
        if len(items) >= MAX_ITEMS_PER_SOURCE * 2:
            break
    return items, None


def _page_item(url: str, fallback: dict | None = None) -> dict | None:
    """Fetch one article page; fall back to feed text if the page refuses us."""
    try:
        response = safe_fetch.fetch(url)
        if response.ok and response.text:
            title, text = extract_text(response.text, url)
            if len(text) >= MIN_TEXT_CHARS:
                return {
                    "url": response.url,
                    "title": title,
                    "text": text,
                    "published": (fallback or {}).get("published"),
                }
    except safe_fetch.FetchError:
        pass

    if fallback and len((fallback.get("feed_text") or "").strip()) >= MIN_TEXT_CHARS:
        return {
            "url": fallback["url"],
            "title": fallback.get("title") or fallback["url"],
            "text": fallback["feed_text"],
            "published": fallback.get("published"),
        }
    return None


def _domain_of(url: str) -> str:
    try:
        return (urlparse(url).hostname or url).replace("www.", "")
    except Exception:
        return url


def fetch_source(source: Source, *, max_items: int = MAX_ITEMS_PER_SOURCE) -> SourceFetch:
    """Network-only worker: safe to run in a thread pool."""
    started = time.monotonic()
    result = SourceFetch(source_id=source.id)

    try:
        response = safe_fetch.fetch(
            source.url, etag=source.etag, last_modified=source.last_modified
        )
    except safe_fetch.FetchError as exc:
        result.status = "error"
        result.error = exc.as_detail()
        result.http_status = exc.status
        result.robots_blocked = isinstance(exc, safe_fetch.RobotsDisallowed)
        result.elapsed_ms = int((time.monotonic() - started) * 1000)
        return result

    result.http_status = response.status
    result.etag = response.etag or source.etag
    result.last_modified = response.last_modified or source.last_modified

    if response.not_modified:
        result.status = "not_modified"
        result.elapsed_ms = int((time.monotonic() - started) * 1000)
        return result

    if not response.ok:
        result.status = "error"
        result.error = f"http {response.status}"
        result.elapsed_ms = int((time.monotonic() - started) * 1000)
        return result

    items: list[dict] = []
    title, text = extract_text(response.text, response.url)
    if len(text) >= MIN_TEXT_CHARS:
        items.append({"url": response.url, "title": title, "text": text, "published": None})

    feed_items, feed_error = _feed_items(source)
    if feed_error:
        result.error = f"feed: {feed_error}"

    seen_item_urls = {canonical_url_key(response.url)}
    for entry in feed_items[:max_items]:
        entry_key = canonical_url_key(entry["url"])
        if entry_key in seen_item_urls:
            continue
        seen_item_urls.add(entry_key)
        item = _page_item(entry["url"], fallback=entry)
        if item:
            items.append(item)

    result.items = items
    if not items and result.status == "ok" and not result.error:
        result.error = "no readable text longer than the minimum"
        result.status = "error"
    result.elapsed_ms = int((time.monotonic() - started) * 1000)
    return result


def _existing_by_url(db, company_id: int, url: str) -> Record | None:
    key = canonical_url_key(url)
    rows = db.scalars(select(Record).where(Record.company_id == company_id)).all()
    for row in rows:
        if canonical_url_key(row.url) == key:
            return row
    return None


def _hash_exists(db, company_id: int, digest: str) -> bool:
    return (
        db.scalar(
            select(Record.id).where(
                Record.company_id == company_id, Record.content_hash == digest
            ).limit(1)
        )
        is not None
    )


def store_item(db, company, source: Source, item: dict) -> str:
    """Persist one crawled document. Returns new | updated | duplicate | empty."""
    text = (item.get("text") or "").strip()
    if len(text) < MIN_TEXT_CHARS:
        return "empty"
    digest = content_hash(text)
    existing = _existing_by_url(db, company.id, item["url"])

    if existing is not None and existing.content_hash == digest:
        return "duplicate"
    if existing is None and _hash_exists(db, company.id, digest):
        return "duplicate"

    is_update = existing is not None
    title = (item.get("title") or item["url"]).strip()[:400]
    record = Record(
        company_id=company.id,
        source_id=source.id,
        url=item["url"],
        title=(f"[UPDATED] {title}" if is_update else title)[:500],
        text=text,
        published=item.get("published"),
        discovered=datetime.now(timezone.utc),
        content_hash=digest,
        is_update=is_update,
    )
    db.add(record)
    db.flush()
    return "updated" if is_update else "new"


def crawl_company(db, company, *, concurrency: int | None = None) -> dict:
    """Crawl every approved source once and record what happened."""
    started = datetime.now(timezone.utc)
    sources = db.scalars(
        select(Source).where(Source.company_id == company.id, Source.status == "approved")
    ).all()
    if not sources:
        summary = {
            "company_id": company.id,
            "sources_checked": 0,
            "message": "no approved sources; approve sources before crawling",
            "new_records": 0,
            "updated_records": 0,
            "duplicates": 0,
            "errors": 0,
        }
        _log(db, company.id, "crawl", "skipped", summary)
        return summary

    workers = max(1, min(concurrency or settings.crawl_concurrency, 4))
    results: list[SourceFetch] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_source, source): source for source in sources}
        for future in as_completed(futures):
            results.append(future.result())

    stats = {
        "new_records": 0,
        "updated_records": 0,
        "duplicates": 0,
        "errors": 0,
        "not_modified": 0,
        "sources_checked": len(sources),
        "per_source": [],
        "duplicate_entries": [],
    }
    by_id = {source.id: source for source in sources}
    now = datetime.now(timezone.utc)

    for result in sorted(results, key=lambda item: item.source_id):
        source = by_id[result.source_id]
        source.last_checked = now
        source.etag = result.etag
        source.last_modified = result.last_modified

        if result.status == "error":
            source.health = "error"
            source.last_error = (result.error or "unknown error")[:900]
            stats["errors"] += 1
            stats["per_source"].append({"source_id": source.id, "url": source.url, "status": "error", "error": source.last_error})
            continue

        source.health = "ok"
        source.last_ok = now
        source.last_error = result.error[:900] if result.error else None

        if result.status == "not_modified":
            stats["not_modified"] += 1
            stats["per_source"].append({"source_id": source.id, "url": source.url, "status": "not_modified"})
            continue

        counts = {"new": 0, "updated": 0, "duplicate": 0, "empty": 0}
        for item in result.items:
            outcome = store_item(db, company, source, item)
            counts[outcome] = counts.get(outcome, 0) + 1
            if outcome == "duplicate" and len(stats["duplicate_entries"]) < 40:
                stats["duplicate_entries"].append(
                    {
                        "source_id": source.id,
                        "source_name": source.name,
                        "url": item.get("url", ""),
                        "title": (item.get("title") or "")[:200],
                    }
                )
        stats["new_records"] += counts["new"]
        stats["updated_records"] += counts["updated"]
        stats["duplicates"] += counts["duplicate"]
        stats["per_source"].append(
            {"source_id": source.id, "url": source.url, "status": "ok", **counts}
        )

    db.commit()
    summary = {**stats, "company_id": company.id, "elapsed_seconds": round((datetime.now(timezone.utc) - started).total_seconds(), 1)}
    status = "ok" if stats["errors"] == 0 else ("partial" if stats["new_records"] or stats["updated_records"] else "error")
    _log(db, company.id, "crawl", status, summary)
    return summary


def _log(db, company_id: int, job: str, status: str, detail: dict) -> None:
    db.add(
        JobLog(
            company_id=company_id,
            job=job,
            status=status,
            detail=json.dumps(detail, default=str)[:8000],
        )
    )
    db.commit()


def append_crawl_log(
    db,
    company_id: int,
    run_id: int,
    level: str,
    message: str,
    *,
    source_domain: str | None = None,
) -> None:
    db.add(
        JobLog(
            company_id=company_id,
            job=f"crawl_log:{run_id}",
            status=level,
            detail=json.dumps(
                {
                    "runId": run_id,
                    "sourceDomain": source_domain,
                    "message": message[:1000],
                }
            ),
        )
    )
    db.commit()


def _read_run_detail(row: JobLog) -> dict:
    try:
        data = json.loads(row.detail) if row.detail else {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_run_detail(row: JobLog, data: dict) -> None:
    row.detail = json.dumps(data, default=str)


def crawl_company_run(
    db,
    company,
    run_id: int,
    *,
    source_ids: list[int] | None = None,
) -> dict:
    """Execute one tracked CrawlRun stored in JobLog with per-source progress, real log lines, and cancel support."""
    run = db.get(JobLog, run_id)
    if run is None or run.job != "crawl_run":
        raise ValueError(f"crawl run {run_id} not found")

    started_mono = time.monotonic()
    run_data = _read_run_detail(run)

    query = select(Source).where(
        Source.company_id == company.id,
        Source.status == "approved",
        Source.category != "internal",
    )
    if source_ids:
        query = query.where(Source.id.in_(source_ids))
    sources = list(db.scalars(query.order_by(Source.id)).all())

    counts_map = {"new": 0, "changed": 0, "unchanged": 0, "failed": 0, "blocked": 0}
    per_source: list[dict] = []

    run.status = "running"
    run_data.update(
        {
            "sourcesTotal": len(sources),
            "sourcesDone": 0,
            "counts": dict(counts_map),
            "perSource": [],
        }
    )
    _write_run_detail(run, run_data)
    db.commit()

    append_crawl_log(
        db,
        company.id,
        run_id,
        "info",
        f"Started crawl across {len(sources)} approved source(s) (robots.txt respected, {round(1.0 / max(1, settings.fetch_requests_per_second), 2)}s rate limit)",
    )

    if not sources:
        finished_dt = datetime.now(timezone.utc)
        run.status = "completed"
        run_data.update(
            {
                "finishedAt": finished_dt.isoformat(),
                "durationMs": int((time.monotonic() - started_mono) * 1000),
                "currentSourceDomain": None,
            }
        )
        _write_run_detail(run, run_data)
        db.commit()
        append_crawl_log(db, company.id, run_id, "warn", "No approved public sources available to crawl")
        return {"run_id": run.id, "status": run.status, "counts": counts_map}

    profile_meta = (company.profile or {}).get("_meta") or {}
    budget_limit = (profile_meta.get("crawler_settings") or {}).get("maxPagesPerRun")
    per_source_cap = MAX_ITEMS_PER_SOURCE
    if isinstance(budget_limit, int) and budget_limit > 0 and len(sources) > 0:
        per_source_cap = max(1, min(MAX_ITEMS_PER_SOURCE, max(1, budget_limit // len(sources))))

    for source in sources:
        db.refresh(run)
        run_data = _read_run_detail(run)
        if run_data.get("cancelRequested"):
            finished_dt = datetime.now(timezone.utc)
            run.status = "cancelled"
            run_data.update(
                {
                    "finishedAt": finished_dt.isoformat(),
                    "durationMs": int((time.monotonic() - started_mono) * 1000),
                    "currentSourceDomain": None,
                }
            )
            _write_run_detail(run, run_data)
            db.commit()
            append_crawl_log(db, company.id, run_id, "warn", "Crawl cancelled by user")
            return {"run_id": run.id, "status": "cancelled", "counts": counts_map}

        domain = _domain_of(source.url)
        run_data["currentSourceDomain"] = domain
        _write_run_detail(run, run_data)
        db.commit()
        append_crawl_log(db, company.id, run_id, "info", f"Fetching {source.url}", source_domain=domain)

        res = fetch_source(source, max_items=per_source_cap)
        now = datetime.now(timezone.utc)
        source.last_checked = now
        source.etag = res.etag
        source.last_modified = res.last_modified

        if res.status == "error":
            source.health = "blocked" if res.robots_blocked else "error"
            source.last_error = (res.error or "unknown error")[:900]
            if res.robots_blocked:
                counts_map["blocked"] += 1
                src_status = "blocked"
                append_crawl_log(db, company.id, run_id, "warn", f"Skipped by robots.txt: {source.last_error}", source_domain=domain)
            else:
                counts_map["failed"] += 1
                src_status = "failed"
                append_crawl_log(db, company.id, run_id, "error", f"Fetch failed: {source.last_error}", source_domain=domain)

            per_source.append(
                {
                    "sourceId": source.id,
                    "sourceName": source.name,
                    "domain": domain,
                    "category": source.category,
                    "status": src_status,
                    "httpStatus": res.http_status,
                    "itemsNew": 0,
                    "itemsChanged": 0,
                    "durationMs": res.elapsed_ms,
                    "error": source.last_error,
                }
            )
        elif res.status == "not_modified":
            source.health = "ok"
            source.last_ok = now
            source.last_error = None
            counts_map["unchanged"] += 1
            per_source.append(
                {
                    "sourceId": source.id,
                    "sourceName": source.name,
                    "domain": domain,
                    "category": source.category,
                    "status": "not_modified",
                    "httpStatus": res.http_status or 304,
                    "itemsNew": 0,
                    "itemsChanged": 0,
                    "durationMs": res.elapsed_ms,
                }
            )
            append_crawl_log(db, company.id, run_id, "info", "HTTP 304 Not Modified (ETag/Last-Modified matched)", source_domain=domain)
        else:
            source.health = "ok"
            source.last_ok = now
            source.last_error = res.error[:900] if res.error else None
            src_counts = {"new": 0, "updated": 0, "duplicate": 0, "empty": 0}
            for item in res.items:
                outcome = store_item(db, company, source, item)
                src_counts[outcome] = src_counts.get(outcome, 0) + 1
            counts_map["new"] += src_counts["new"]
            counts_map["changed"] += src_counts["updated"]
            counts_map["unchanged"] += src_counts["duplicate"]
            src_status = "partial" if res.error else "success"
            per_source.append(
                {
                    "sourceId": source.id,
                    "sourceName": source.name,
                    "domain": domain,
                    "category": source.category,
                    "status": src_status,
                    "httpStatus": res.http_status or 200,
                    "itemsNew": src_counts["new"],
                    "itemsChanged": src_counts["updated"],
                    "durationMs": res.elapsed_ms,
                    "error": res.error,
                }
            )
            append_crawl_log(
                db,
                company.id,
                run_id,
                "success" if (src_counts["new"] or src_counts["updated"]) else "info",
                f"HTTP {res.http_status or 200} · {src_counts['new']} new, {src_counts['updated']} changed, {src_counts['duplicate']} unchanged ({res.elapsed_ms}ms)",
                source_domain=domain,
            )

        run_data["sourcesDone"] = int(run_data.get("sourcesDone", 0)) + 1
        run_data["counts"] = dict(counts_map)
        run_data["perSource"] = list(per_source)
        _write_run_detail(run, run_data)
        db.commit()

    finished_dt = datetime.now(timezone.utc)
    total_ms = int((time.monotonic() - started_mono) * 1000)
    had_failures = counts_map["failed"] > 0 or counts_map["blocked"] > 0
    had_success = any(row["status"] in ("success", "not_modified", "partial") for row in per_source)
    final_status = (
        "completed"
        if not had_failures
        else ("partial" if had_success else "failed")
    )

    run.status = final_status
    run_data.update(
        {
            "finishedAt": finished_dt.isoformat(),
            "durationMs": total_ms,
            "currentSourceDomain": None,
            "counts": dict(counts_map),
            "perSource": list(per_source),
        }
    )
    _write_run_detail(run, run_data)
    db.commit()

    _log(
        db,
        company.id,
        "crawl",
        "ok" if final_status == "completed" else ("partial" if final_status == "partial" else "error"),
        {
            "run_id": run.id,
            "sources_checked": len(sources),
            "new_records": counts_map["new"],
            "updated_records": counts_map["changed"],
            "duplicates": counts_map["unchanged"],
            "errors": counts_map["failed"],
            "blocked": counts_map["blocked"],
            "elapsed_seconds": round(total_ms / 1000.0, 1),
        },
    )
    append_crawl_log(
        db,
        company.id,
        run_id,
        "success" if final_status == "completed" else ("warn" if final_status == "partial" else "error"),
        f"Run finished ({final_status}) in {round(total_ms / 1000.0, 1)}s — {counts_map['new']} new, {counts_map['changed']} changed, {counts_map['failed']} failed",
    )
    return {"run_id": run.id, "status": final_status, "counts": counts_map}

