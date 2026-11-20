"""Competitor intelligence discovery & researched profiles.

Every competitor profile must come from a real HTTP fetch via safe_fetch.
Any profile whose evidence_url was not actually fetched is dropped rather than fabricated.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

import llm
import safe_fetch
from db import JobLog, Source
from schemas import CompetitorCandidateList, CompetitorProfileBatch

logger = logging.getLogger("signalstack.competitors")

MAX_CANDIDATES = 10
MAX_PAGE_CHARS = 5000


def _normalise_site(url: str) -> str:
    raw = (url or "").strip()
    if raw and "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if not parsed.netloc:
        return ""
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}{parsed.path or ''}".rstrip("/")


def _extract_visible_text(html: str) -> str:
    soup = BeautifulSoup(html or "", "lxml")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    return " ".join(soup.get_text(" ", strip=True).split())[:MAX_PAGE_CHARS]


def _candidate_prompt(company) -> str:
    profile = company.profile or {}
    hints = profile.get("likely_competitors") or []
    answers = ((profile.get("intelligence") or {}).get("founder_answers") or [])[:6]
    return (
        f"Company: {company.name} ({company.website})\n"
        f"Summary: {profile.get('summary', '')}\n"
        f"Industry: {profile.get('industry', '')}\n"
        f"Founder context: {company.context or '(none)'}\n"
        f"Initial competitor hints: {json.dumps(hints, ensure_ascii=False)}\n"
        f"Founder answers: {json.dumps(answers, ensure_ascii=False)}\n\n"
        "Suggest 5 to 10 real, active direct or indirect competitors with their official homepage "
        "URLs (https://...). Do not invent fake domains or include the target company itself."
    )


def _profile_prompt(company, fetched_pages: list[dict]) -> str:
    blocks = "\n\n".join(llm.wrap_untrusted(page["url"], page["text"]) for page in fetched_pages)
    return (
        f"Target company: {company.name} ({company.website})\n"
        f"Target positioning: {(company.profile or {}).get('positioning', '')}\n\n"
        "From ONLY the fetched competitor pages below, produce a structured profile for each "
        "competitor: name, website, positioning, pricing_or_offer (or 'not stated on homepage'), "
        "strengths, weaknesses, differentiation vs the target company, and evidence_url (must match "
        "one of the exact fetched URLs below). Do not invent facts outside the pages.\n\n"
        + blocks
    )


def discover_competitors(db, company) -> dict:
    """Identify 5-10 competitors, fetch their public homepages, and persist verified profiles."""
    candidate_batch = llm.ask(_candidate_prompt(company), CompetitorCandidateList, max_tokens=1500)

    target_host = urlparse(company.website).netloc.lower().removeprefix("www.")
    seen_hosts: set[str] = set()
    candidates: list[dict] = []

    # Seed from existing likely_competitors hints that carry URLs, then LLM candidates
    for hint in (company.profile or {}).get("likely_competitors") or []:
        url = _normalise_site(hint.get("url") or "")
        if url:
            host = urlparse(url).netloc.lower().removeprefix("www.")
            if host and host != target_host and host not in seen_hosts:
                seen_hosts.add(host)
                candidates.append({"name": hint.get("name") or host, "url": url})

    for cand in candidate_batch.competitors:
        url = _normalise_site(cand.website)
        if not url:
            continue
        host = urlparse(url).netloc.lower().removeprefix("www.")
        if not host or host == target_host or host in seen_hosts:
            continue
        seen_hosts.add(host)
        candidates.append({"name": cand.name.strip(), "url": url})
        if len(candidates) >= MAX_CANDIDATES:
            break

    fetched_pages: list[dict] = []
    failed: list[dict] = []
    for cand in candidates[:MAX_CANDIDATES]:
        try:
            res = safe_fetch.fetch(cand["url"])
        except safe_fetch.FetchError as exc:
            failed.append({"name": cand["name"], "url": cand["url"], "reason": exc.as_detail()})
            continue
        if not res.ok:
            failed.append({"name": cand["name"], "url": cand["url"], "reason": f"http {res.status}"})
            continue
        text = _extract_visible_text(res.text)
        if len(text) < 40:
            failed.append({"name": cand["name"], "url": res.url, "reason": "page had too little readable text"})
            continue
        fetched_pages.append({"name": cand["name"], "url": res.url, "requested_url": cand["url"], "text": text})

    profiles: list[dict] = []
    if fetched_pages:
        valid_urls = {p["url"].rstrip("/") for p in fetched_pages} | {
            p["requested_url"].rstrip("/") for p in fetched_pages
        }
        batch = llm.ask(_profile_prompt(company, fetched_pages), CompetitorProfileBatch, max_tokens=2800)
        for item in batch.profiles:
            ev = (item.evidence_url or item.website).rstrip("/")
            if ev not in valid_urls:
                continue
            profiles.append(
                {
                    "name": item.name.strip(),
                    "website": _normalise_site(item.website) or ev,
                    "positioning": item.positioning.strip(),
                    "pricing_or_offer": item.pricing_or_offer.strip(),
                    "strengths": [s.strip() for s in item.strengths if s.strip()][:5],
                    "weaknesses": [w.strip() for w in item.weaknesses if w.strip()][:5],
                    "differentiation": item.differentiation.strip(),
                    "evidence_url": ev,
                }
            )

    profile_data = dict(company.profile or {})
    profile_data["competitors_researched"] = profiles
    profile_data["competitors_meta"] = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "fetched_count": len(fetched_pages),
        "failed": failed,
    }
    company.profile = profile_data
    flag_modified(company, "profile")
    db.add(
        JobLog(
            company_id=company.id,
            job="competitors",
            status="ok" if profiles else "partial",
            detail=json.dumps({"researched": len(profiles), "failed": len(failed)}),
        )
    )
    db.commit()
    return {
        "company_id": company.id,
        "competitors": profiles,
        "fetched_count": len(fetched_pages),
        "failed": failed,
    }


def list_competitors(db, company) -> dict:
    profile = company.profile or {}
    monitored_sources = list(
        db.scalars(
            select(Source).where(Source.company_id == company.id, Source.category == "competitors")
        ).all()
    )
    return {
        "company_id": company.id,
        "competitors": profile.get("competitors_researched") or [],
        "hints": profile.get("likely_competitors") or [],
        "meta": profile.get("competitors_meta") or {},
        "monitored_sources": [
            {
                "id": s.id,
                "name": s.name,
                "url": s.url,
                "status": s.status,
                "health": s.health,
            }
            for s in monitored_sources
        ],
    }
