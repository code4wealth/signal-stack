"""Phase 4 - source discovery.

The LLM proposes candidate URLs; nothing is stored until safe_fetch has actually
fetched it. Unreachable, blocked or robots-disallowed candidates are dropped and
reported as dropped, never silently kept. Competitor sites come from the verified
research profile, not from the model's imagination.
"""

from __future__ import annotations

import logging
from urllib.parse import urljoin, urlparse

import feedparser
from bs4 import BeautifulSoup
from sqlalchemy import select

import llm
import safe_fetch
from db import Source
from research import normalise_url
from schemas import DiscoveryBatch, DiscoveredSource

logger = logging.getLogger("signalstack.discovery")

DISCOVERY_CATEGORIES = ("customers", "competitors", "market")
MAX_CANDIDATES = 40
FEED_TYPES = ("application/rss+xml", "application/atom+xml", "application/xml", "text/xml")


class DiscoveryError(RuntimeError):
    pass


def find_feed_url(html: str, base_url: str) -> str | None:
    """Read declared RSS/Atom autodiscovery links from a page."""
    if not html:
        return None
    soup = BeautifulSoup(html, "html.parser")
    for link in soup.find_all("link", href=True):
        rel = " ".join(link.get("rel", []) or []).lower()
        link_type = (link.get("type") or "").lower()
        if "alternate" in rel and any(feed_type in link_type for feed_type in FEED_TYPES):
            return urljoin(base_url, str(link["href"]).strip())
    return None


def verify_candidate(url: str) -> tuple[bool, str, str, str | None]:
    """Fetch a candidate for real. Returns (ok, detail, final_url, feed_url)."""
    try:
        result = safe_fetch.fetch(url)
    except safe_fetch.FetchError as exc:
        return False, exc.as_detail(), url, None
    if not result.ok or not result.text:
        return False, f"http {result.status} or empty body", result.url, None

    feed_url = None
    path = urlparse(result.url).path.lower()
    if path.endswith((".xml", ".rss", ".atom")):
        feed_url = result.url
    else:
        candidate_feed = find_feed_url(result.text, result.url)
        if candidate_feed:
            try:
                feed_response = safe_fetch.fetch(candidate_feed)
                parsed = feedparser.parse(feed_response.content)
                if getattr(parsed, "entries", None):
                    feed_url = candidate_feed
            except safe_fetch.FetchError as exc:
                logger.info("feed %s failed verification: %s", candidate_feed, exc.kind)
    return True, f"http {result.status}", result.url, feed_url


def _clamp_reliability(value: float) -> float:
    return max(0.2, min(0.95, float(value)))


def _propose(company, profile: dict, intelligence: dict) -> list[DiscoveredSource]:
    summary = profile.get("summary", "")
    industry = profile.get("industry", "")
    competitors = ", ".join(
        f"{hint.get('name')} ({hint.get('website')})" for hint in profile.get("likely_competitors", [])
    ) or "(none identified)"
    answers = intelligence.get("founder_answers", [])[:6]
    founder_block = "\n".join(f"Q: {item['question']}\nA: {item['answer']}" for item in answers) or "(no interview yet)"

    prompt = (
        f"Company: {company.name} ({company.website})\n"
        f"Industry: {industry or 'unclear'}\n"
        f"Profile summary: {summary}\n"
        f"Founder context: {company.context or '(none)'}\n"
        f"Likely competitors already identified: {competitors}\n\n"
        f"Founder interview answers:\n{founder_block}\n\n"
        "Propose monitoring sources in exactly these three categories:\n"
        "- customers: pages where this company's customers or their industries publish news, "
        "reviews, procurement notices, trade bodies or community discussions.\n"
        "- competitors: real competitor company sites, plus credible trade press covering them.\n"
        "- market: regulators, industry associations, market/statistics bodies, funding news, "
        "technology shifts relevant to this sector.\n\n"
        "Rules:\n"
        "- Give root-level public URLs that exist today (no search-result pages, no login walls, "
        "no guessed article slugs).\n"
        f"- At most {MAX_CANDIDATES} candidates in total, at most 12 per category.\n"
        "- Prefer sources that publish regularly (news, blog, feed, filings).\n"
        "- reliability: 0.9 official regulator/statistics, 0.7 established trade press, "
        "0.6 company site, 0.4 blog/community.\n"
        "- reason: why this source matters for this company. expected: what signals to look for.\n"
        "- If you are not confident a URL exists, leave it out rather than guessing."
    )
    batch = llm.ask(prompt, DiscoveryBatch, max_tokens=3500, temperature=0.3)
    cleaned: list[DiscoveredSource] = []
    for candidate in batch.sources:
        if candidate.category not in DISCOVERY_CATEGORIES:
            continue
        # Non-http URLs are kept here and rejected by safe_fetch, so the drop is
        # reported with a reason instead of silently disappearing.
        cleaned.append(candidate)
    return cleaned[:MAX_CANDIDATES]


def _competitor_candidates(profile: dict) -> list[DiscoveredSource]:
    candidates = []
    for hint in profile.get("likely_competitors", [])[:10]:
        website = (hint.get("website") or "").strip()
        if not website.startswith(("http://", "https://")):
            continue
        candidates.append(
            DiscoveredSource(
                name=hint.get("name") or urlparse(website).netloc,
                url=website,
                category="competitors",
                reason=hint.get("reason", "") or "Named as a likely competitor during research.",
                expected="Product launches, pricing changes, funding, hiring and partnerships.",
                reliability=0.6,
            )
        )
    return candidates


def discover(db, company) -> dict:
    profile = company.profile or {}
    if not profile.get("summary"):
        raise DiscoveryError("Run company research before discovering sources.")

    intelligence = profile.get("intelligence") or {}
    proposed = _propose(company, profile, intelligence)
    candidates = _competitor_candidates(profile) + proposed

    existing_urls = {
        normalise_url(url)
        for url in db.scalars(select(Source.url).where(Source.company_id == company.id)).all()
    }

    created: list[dict] = []
    dropped: list[dict] = []
    seen = set(existing_urls)

    for candidate in candidates:
        key = normalise_url(candidate.url)
        if key in seen:
            dropped.append({"url": candidate.url, "reason": "duplicate of an existing source"})
            continue
        seen.add(key)

        ok, detail, final_url, feed_url = verify_candidate(candidate.url)
        if not ok:
            dropped.append({"url": candidate.url, "reason": detail})
            continue

        # A redirect may land on a URL we already track.
        final_key = normalise_url(final_url)
        if final_key != key and final_key in existing_urls:
            dropped.append({"url": candidate.url, "reason": "redirects to an existing source"})
            continue

        source = Source(
            company_id=company.id,
            name=candidate.name.strip()[:300] or urlparse(final_url).netloc,
            url=final_url,
            feed_url=feed_url,
            category=candidate.category,
            reason=candidate.reason[:1000],
            expected=candidate.expected[:1000],
            reliability=_clamp_reliability(candidate.reliability),
            status="pending",
            health="ok",
        )
        db.add(source)
        db.flush()
        created.append(
            {
                "id": source.id,
                "name": source.name,
                "url": source.url,
                "feed_url": source.feed_url,
                "category": source.category,
                "reliability": source.reliability,
            }
        )

    db.commit()
    counts = {category: 0 for category in DISCOVERY_CATEGORIES}
    for item in created:
        counts[item["category"]] = counts.get(item["category"], 0) + 1
    return {
        "company_id": company.id,
        "created": created,
        "created_count": len(created),
        "dropped": dropped,
        "dropped_count": len(dropped),
        "counts_by_category": counts,
        "candidates_evaluated": len(candidates),
    }
