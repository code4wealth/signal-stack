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

import feedparser
from sqlalchemy import select

import safe_fetch
from config import get_settings
from db import JobLog, Record, Source
from research import extract_text, normalise_url

logger = logging.getLogger("signalstack.crawler")
settings = get_settings()

MAX_ITEMS_PER_SOURCE = 8
MIN_TEXT_CHARS = 250


@dataclass
class SourceFetch:
    source_id: int
    status: str = "ok"  # ok | not_modified | error
    error: str | None = None
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


def fetch_source(source: Source) -> SourceFetch:
    """Network-only worker: safe to run in a thread pool."""
    result = SourceFetch(source_id=source.id)

    try:
        response = safe_fetch.fetch(
            source.url, etag=source.etag, last_modified=source.last_modified
        )
    except safe_fetch.FetchError as exc:
        result.status = "error"
        result.error = exc.as_detail()
        return result

    result.etag = response.etag or source.etag
    result.last_modified = response.last_modified or source.last_modified

    if response.not_modified:
        result.status = "not_modified"
        return result

    if not response.ok:
        result.status = "error"
        result.error = f"http {response.status}"
        return result

    items: list[dict] = []
    title, text = extract_text(response.text, response.url)
    if len(text) >= MIN_TEXT_CHARS:
        items.append({"url": response.url, "title": title, "text": text, "published": None})

    feed_items, feed_error = _feed_items(source)
    if feed_error:
        result.error = f"feed: {feed_error}"

    for entry in feed_items[:MAX_ITEMS_PER_SOURCE]:
        if normalise_url(entry["url"]) == normalise_url(response.url):
            continue
        item = _page_item(entry["url"], fallback=entry)
        if item:
            items.append(item)

    result.items = items
    if not items and result.status == "ok" and not result.error:
        result.error = "no readable text longer than the minimum"
        result.status = "error"
    return result


def _existing_by_url(db, company_id: int, url: str) -> Record | None:
    key = normalise_url(url)
    rows = db.scalars(select(Record).where(Record.company_id == company_id)).all()
    for row in rows:
        if normalise_url(row.url) == key:
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
