"""Phase 2 - company research.

Fetch the homepage plus up to five relevant internal pages, extract readable
text, and let the LLM build a Profile. Every fact must cite a page we actually
fetched; facts citing anything else are demoted into `unverified`.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

import safe_fetch
from schemas import Profile

logger = logging.getLogger("signalstack.research")

MAX_INTERNAL_PAGES = 5
MAX_TEXT_PER_PAGE = 6000
TEXT_FOR_HOME = 8000
DEFAULT_PAGE_TOTAL_TIMEOUT_SECONDS = 30.0
DEFAULT_JOB_TIMEOUT_SECONDS = 300.0

# Generic information-architecture hints; deliberately not company specific.
PAGE_KEYWORDS = (
    "about",
    "company",
    "product",
    "platform",
    "solution",
    "service",
    "pricing",
    "customer",
    "case-stud",
    "industr",
    "team",
    "mission",
    "what-we-do",
    "how-it-works",
    "admission",
    "program",
    "course",
)

SKIP_EXTENSIONS = (
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".zip",
    ".mp4",
    ".css",
    ".js",
    ".ico",
)


class ResearchError(RuntimeError):
    pass


def normalise_url(url: str) -> str:
    """Compare URLs the way a human would: ignore trailing slash, case and fragments."""
    try:
        parsed = urlparse((url or "").strip())
    except ValueError:
        return (url or "").strip()
    path = parsed.path.rstrip("/") or "/"
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}{path}"


_TRACKING_QUERY_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "ref",
}


def canonical_url_key(url: str) -> str:
    """Canonical URL key for deduplication: ignores http/https, www., trailing slash, fragments, and tracking params."""
    from urllib.parse import parse_qsl, urlencode

    raw = (url or "").strip()
    try:
        parsed = urlparse(raw)
    except ValueError:
        return raw.lower()
    scheme = parsed.scheme.lower()
    host = parsed.netloc.lower()
    path = parsed.path.rstrip("/") or "/"
    if scheme == "upload":
        return f"upload://{host}{path}"
    if host.startswith("www."):
        host = host[4:]
    clean_qs = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=False)
        if k.lower() not in _TRACKING_QUERY_PARAMS
    ]
    query_str = f"?{urlencode(sorted(clean_qs))}" if clean_qs else ""
    return f"{host}{path}{query_str}"


@dataclass
class Page:
    url: str
    title: str
    text: str
    status: int = 200


@dataclass
class SiteContent:
    homepage: Page | None = None
    internal: list[Page] = field(default_factory=list)
    failures: list[str] = field(default_factory=list)
    deadline_error: str | None = None

    @property
    def pages(self) -> list[Page]:
        return ([self.homepage] if self.homepage else []) + self.internal

    @property
    def urls(self) -> set[str]:
        return {normalise_url(page.url) for page in self.pages}


def _extract_structured_meta(html: str) -> tuple[str, list[str]]:
    """Extract meta descriptions and JSON-LD summaries from HTML (for JS/SPA sites)."""
    import json
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    meta_title = ""
    if soup.title and soup.title.string:
        meta_title = soup.title.string.strip()

    snippets: list[str] = []
    seen: set[str] = set()

    def _add(label: str, raw: str | None) -> None:
        val = " ".join((raw or "").split())
        if len(val) < 10:
            return
        key = val.lower()
        if key in seen:
            return
        seen.add(key)
        snippets.append(f"{label}: {val}" if label else val)

    for attr_name, attr_val, label in (
        ("property", "og:title", ""),
        ("name", "description", "Description"),
        ("property", "og:description", "Summary"),
        ("name", "twitter:description", "Summary"),
    ):
        tag = soup.find("meta", attrs={attr_name: attr_val})
        if tag and tag.get("content"):
            content = str(tag["content"]).strip()
            if attr_val == "og:title" and not meta_title:
                meta_title = content
            else:
                _add(label, content)

    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw_json = (script.string or script.get_text() or "").strip()
        if not raw_json:
            continue
        try:
            payload = json.loads(raw_json)
        except (ValueError, TypeError):
            continue
        nodes = payload if isinstance(payload, list) else [payload]
        expanded: list[dict] = []
        for node in nodes:
            if isinstance(node, dict):
                expanded.append(node)
                graph = node.get("@graph")
                if isinstance(graph, list):
                    expanded.extend(item for item in graph if isinstance(item, dict))
        for item in expanded[:10]:
            if isinstance(item.get("name"), str) and not meta_title:
                meta_title = item["name"].strip()
            for key, label in (
                ("description", "About"),
                ("slogan", "Positioning"),
                ("industry", "Industry"),
                ("applicationCategory", "Category"),
            ):
                val = item.get(key)
                if isinstance(val, str):
                    _add(label, val)

    return meta_title, snippets


def extract_text(html: str, url: str) -> tuple[str, str]:
    """Return (title, readable text). trafilatura first, BeautifulSoup + meta/JSON-LD fallback."""
    title = ""
    text = ""
    try:
        import trafilatura

        extracted = trafilatura.extract(
            html, url=url, include_comments=False, include_tables=True, favor_recall=True
        )
        text = (extracted or "").strip()
        metadata = trafilatura.extract_metadata(html, default_url=url)
        if metadata and metadata.title:
            title = metadata.title.strip()
    except Exception as exc:  # extraction must never break research
        logger.warning("trafilatura failed for %s: %s", url, exc.__class__.__name__)

    if not text:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "noscript", "template"]):
            tag.decompose()
        if not title and soup.title and soup.title.string:
            title = soup.title.string.strip()
        text = " ".join(soup.get_text(" ").split())

    if len(text) < 400:
        meta_title, meta_snippets = _extract_structured_meta(html)
        if not title and meta_title:
            title = meta_title
        if meta_snippets:
            extra = " ".join(s for s in meta_snippets if s.lower() not in text.lower())
            if extra:
                text = f"{text}\n{extra}".strip() if text else extra

    if not title:
        title = urlparse(url).netloc
    return title[:300], text


def same_site(candidate: str, base: str) -> bool:
    try:
        a, b = urlparse(candidate), urlparse(base)
    except ValueError:
        return False
    return a.scheme in ("http", "https") and a.netloc.lower() == b.netloc.lower()


def pick_internal_links(html: str, base_url: str, limit: int = MAX_INTERNAL_PAGES) -> list[str]:
    """Rank same-site links by information value; return up to `limit` URLs."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    scored: dict[str, float] = {}
    for anchor in soup.find_all("a", href=True):
        href = str(anchor["href"]).strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        absolute = urljoin(base_url, href).split("#")[0]
        if not same_site(absolute, base_url):
            continue
        path = urlparse(absolute).path.lower()
        if path in ("", "/"):
            continue
        if path.endswith(SKIP_EXTENSIONS):
            continue
        label = (anchor.get_text(" ") or "").strip().lower()
        score = sum(2.0 for kw in PAGE_KEYWORDS if kw in path)
        score += sum(1.0 for kw in PAGE_KEYWORDS if kw in label)
        if score <= 0 and path.count("/") > 3:
            continue  # deep, unlabeled pages are noise
        scored[absolute] = max(scored.get(absolute, 0.0), score)

    ordered = sorted(scored.items(), key=lambda item: (-item[1], item[0]))
    return [url for url, _ in ordered[:limit]]


def _www_fallback_url(website: str) -> str | None:
    parsed = urlparse(website.strip())
    host = (parsed.hostname or "").lower()
    if not host:
        return None
    if host.startswith("www.") and host.count(".") >= 2:
        alt_host = host[4:]
    elif not host.startswith("www.") and host.count(".") <= 2:
        alt_host = f"www.{host}"
    else:
        return None
    netloc = f"{alt_host}:{parsed.port}" if parsed.port else alt_host
    return parsed._replace(netloc=netloc).geturl()


FALLBACK_INFO_PATHS = ("/about", "/about-us", "/company", "/products", "/pricing")


def collect_site(
    website: str,
    *,
    job_timeout: float = DEFAULT_JOB_TIMEOUT_SECONDS,
    page_timeout: float = DEFAULT_PAGE_TOTAL_TIMEOUT_SECONDS,
) -> SiteContent:
    """Fetch homepage + internal pages within wall-clock deadlines. Never raises for network problems."""
    content = SiteContent()
    job_deadline = time.monotonic() + float(job_timeout)

    def _page_budget() -> float:
        remaining = job_deadline - time.monotonic()
        if remaining <= 0:
            return 0.0
        return min(float(page_timeout), remaining)

    budget = _page_budget()
    if budget <= 0:
        content.deadline_error = f"Site did not respond within {int(round(job_timeout))}s: {urlparse(website).hostname or website}"
        content.failures.append(f"homepage: {content.deadline_error}")
        return content

    home = None
    try:
        home = safe_fetch.fetch(website, total_timeout=budget)
    except safe_fetch.FetchDeadlineExceeded as exc:
        alt_url = _www_fallback_url(website)
        remaining = _page_budget()
        if alt_url and remaining > 0.05:
            try:
                home = safe_fetch.fetch(alt_url, total_timeout=remaining)
            except safe_fetch.FetchDeadlineExceeded as alt_exc:
                content.deadline_error = alt_exc.message
                content.failures.append(f"homepage: {exc.as_detail()}")
                content.failures.append(f"homepage ({alt_url}): {alt_exc.as_detail()}")
                return content
            except safe_fetch.FetchError as alt_exc:
                content.deadline_error = exc.message
                content.failures.append(f"homepage: {exc.as_detail()}")
                content.failures.append(f"homepage ({alt_url}): {alt_exc.as_detail()}")
                return content
        else:
            content.deadline_error = exc.message
            content.failures.append(f"homepage: {exc.as_detail()}")
            return content
    except safe_fetch.FetchFailed as exc:
        alt_url = _www_fallback_url(website)
        remaining = _page_budget()
        if not alt_url or remaining <= 0:
            content.failures.append(f"homepage: {exc.as_detail()}")
            return content
        try:
            home = safe_fetch.fetch(alt_url, total_timeout=remaining)
        except safe_fetch.FetchDeadlineExceeded as alt_exc:
            content.deadline_error = alt_exc.message
            content.failures.append(f"homepage: {exc.as_detail()}")
            content.failures.append(f"homepage ({alt_url}): {alt_exc.as_detail()}")
            return content
        except safe_fetch.FetchError as alt_exc:
            content.failures.append(f"homepage: {exc.as_detail()}")
            content.failures.append(f"homepage ({alt_url}): {alt_exc.as_detail()}")
            return content
    except safe_fetch.FetchError as exc:
        content.failures.append(f"homepage: {exc.as_detail()}")
        return content

    if not home.ok or not home.text:
        content.failures.append(f"homepage: empty or non-OK response (http {home.status})")
        return content

    title, text = extract_text(home.text, home.url)
    if len(text.strip()) < 200:
        # Thin/JS-shell homepage: check any internal links on the page + common public subpaths.
        candidate_links = pick_internal_links(home.text, home.url)
        origin_parsed = urlparse(home.url)
        origin = f"{origin_parsed.scheme}://{origin_parsed.netloc}"
        for path in FALLBACK_INFO_PATHS:
            cand = f"{origin}{path}"
            if cand not in candidate_links:
                candidate_links.append(cand)
        for link in candidate_links[:MAX_INTERNAL_PAGES]:
            budget = _page_budget()
            if budget <= 0:
                break
            try:
                sub = safe_fetch.fetch(link, total_timeout=budget)
            except safe_fetch.FetchError as exc:
                content.failures.append(f"{link}: {exc.as_detail()}")
                continue
            if not sub.ok or not sub.text:
                continue
            sub_title, sub_text = extract_text(sub.text, sub.url)
            if len(sub_text.strip()) >= 200:
                content.internal.append(
                    Page(url=sub.url, title=sub_title, text=sub_text[:MAX_TEXT_PER_PAGE], status=sub.status)
                )
        if not content.internal:
            content.failures.append(f"homepage: only {len(text.strip())} chars of readable text")
        return content

    content.homepage = Page(url=home.url, title=title, text=text[:TEXT_FOR_HOME], status=home.status)

    for link in pick_internal_links(home.text, home.url):
        if link == home.url:
            continue
        budget = _page_budget()
        if budget <= 0:
            host = (urlparse(link).hostname or link).lower()
            content.deadline_error = f"Site did not respond within {int(round(job_timeout))}s: {host}"
            content.failures.append(f"{link}: {content.deadline_error}")
            break
        try:
            page = safe_fetch.fetch(link, total_timeout=budget)
        except safe_fetch.FetchDeadlineExceeded as exc:
            content.deadline_error = exc.message
            content.failures.append(f"{link}: {exc.as_detail()}")
            break
        except safe_fetch.FetchError as exc:
            content.failures.append(f"{link}: {exc.as_detail()}")
            continue
        if not page.ok or not page.text:
            content.failures.append(f"{link}: http {page.status}")
            continue
        page_title, page_text = extract_text(page.text, page.url)
        if len(page_text) < 200:
            content.failures.append(f"{link}: too little readable text")
            continue
        content.internal.append(
            Page(url=page.url, title=page_title, text=page_text[:MAX_TEXT_PER_PAGE], status=page.status)
        )

    return content


def build_profile(company_name: str, context: str, content: SiteContent) -> Profile:
    if not content.pages:
        raise ResearchError("no pages could be fetched from the company website")

    import llm

    blocks = [llm.wrap_untrusted("homepage", content.homepage.text)] if content.homepage else []
    for page in content.internal:
        blocks.append(llm.wrap_untrusted(page.url, page.text))

    allowed = "\n".join(sorted(content.urls))
    prompt = (
        f"Company name: {company_name}\n"
        f"Founder-supplied context: {context or '(none)'}\n\n"
        "Below are pages fetched from the company's own website. Build a factual profile.\n"
        "Rules:\n"
        "- Every fact's evidence_url MUST be one of the fetched page URLs listed here:\n"
        f"{allowed}\n"
        "- If the pages do not state something, do not assert it: put it in `unverified` as a "
        "clearly marked hypothesis instead.\n"
        "- `likely_competitors` may be inferred from what the company says it does; give each a "
        "real homepage URL that you are confident exists.\n\n" + "\n\n".join(blocks)
    )

    profile = llm.ask(prompt, Profile, max_tokens=3000)
    return validate_profile(profile, content.urls)


def validate_profile(profile: Profile, fetched_urls: set[str]) -> Profile:
    """Drop facts whose evidence was not actually fetched; keep the claim as unverified."""
    demoted: list[str] = []

    def keep(facts: list, label: str) -> list:
        kept = []
        for fact in facts:
            if normalise_url(fact.evidence_url) in fetched_urls:
                fact.verified = True
                kept.append(fact)
            else:
                fact.verified = False
                demoted.append(f"[{label}] {fact.text} (unsupported evidence_url: {fact.evidence_url})")
        return kept

    profile.products = keep(profile.products, "products")
    profile.customers = keep(profile.customers, "customers")
    profile.geography = keep(profile.geography, "geography")
    profile.differentiators = keep(profile.differentiators, "differentiators")
    profile.growth_opportunities = keep(profile.growth_opportunities, "growth_opportunities")
    profile.challenges = keep(profile.challenges, "challenges")

    competitors = []
    for hint in profile.likely_competitors:
        if hint.website.startswith(("http://", "https://")) and hint.name.strip():
            competitors.append(hint)
    profile.likely_competitors = competitors[:10]

    seen = list(dict.fromkeys(profile.unverified + demoted))
    profile.unverified = seen[:30]
    return profile


def _save_partial_unverified_profile(db, company, content: SiteContent, deadline_msg: str) -> None:
    """Persist partial fetched pages strictly as unverified notes when a deadline cuts research short."""
    from datetime import datetime, timezone

    unverified_notes = [
        f"[Partial unverified page: {page.title}] ({page.url}) — {page.text[:320]}"
        for page in content.pages
    ]
    if content.failures:
        unverified_notes.append(f"[Incomplete research] {deadline_msg}")

    existing_meta = (company.profile or {}).get("_meta", {})
    partial_profile = Profile(
        summary=f"Partial research saved before timeout ({len(content.pages)} page(s) fetched; unverified).",
        industry="",
        unverified=unverified_notes[:30],
    ).model_dump()
    partial_profile["_meta"] = {
        "pages_fetched": [page.url for page in content.pages],
        "fetch_failures": content.failures[:20],
        "partial": True,
        "deadline_error": deadline_msg,
        "researched_at": datetime.now(timezone.utc).isoformat(),
        "confirmed_at": existing_meta.get("confirmed_at"),
        "intelligence": (company.profile or {}).get("intelligence", {}),
    }
    if company.profile and company.profile.get("intelligence"):
        partial_profile["intelligence"] = company.profile["intelligence"]
    company.profile = partial_profile
    db.commit()
    db.refresh(company)


def research_company(
    db,
    company,
    *,
    job_timeout: float = DEFAULT_JOB_TIMEOUT_SECONDS,
    page_timeout: float = DEFAULT_PAGE_TOTAL_TIMEOUT_SECONDS,
) -> dict:
    """Run research for a company and persist the profile. Returns the stored dict."""
    import llm

    job_deadline = time.monotonic() + float(job_timeout)
    content = collect_site(
        company.website,
        job_timeout=job_timeout,
        page_timeout=page_timeout,
    )
    if not content.pages:
        if content.deadline_error:
            raise ResearchError(content.deadline_error)
        raise ResearchError(
            "Could not fetch any page from " + company.website + ": " + "; ".join(content.failures[:3])
        )

    if content.deadline_error or time.monotonic() >= job_deadline:
        deadline_msg = content.deadline_error or (
            f"Site did not respond within {int(round(job_timeout))}s: {urlparse(company.website).hostname or company.website}"
        )
        _save_partial_unverified_profile(db, company, content, deadline_msg)
        raise ResearchError(deadline_msg)

    profile = build_profile(company.name, company.context, content)
    stored = profile.model_dump()
    from datetime import datetime, timezone

    existing_meta = (company.profile or {}).get("_meta", {})
    stored["_meta"] = {
        "pages_fetched": [page.url for page in content.pages],
        "fetch_failures": content.failures[:20],
        "model": llm.settings.groq_model,
        "researched_at": datetime.now(timezone.utc).isoformat(),
        "confirmed_at": existing_meta.get("confirmed_at"),
        "intelligence": (company.profile or {}).get("intelligence", {}),
    }
    if company.profile and company.profile.get("intelligence"):
        stored["intelligence"] = company.profile["intelligence"]
    company.profile = stored
    db.commit()
    db.refresh(company)
    return stored
