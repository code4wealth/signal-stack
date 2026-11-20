"""Phase 2 - company research.

Fetch the homepage plus up to five relevant internal pages, extract readable
text, and let the LLM build a Profile. Every fact must cite a page we actually
fetched; facts citing anything else are demoted into `unverified`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

import safe_fetch
from schemas import Profile

logger = logging.getLogger("signalstack.research")

MAX_INTERNAL_PAGES = 5
MAX_TEXT_PER_PAGE = 6000
TEXT_FOR_HOME = 8000

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

    @property
    def pages(self) -> list[Page]:
        return ([self.homepage] if self.homepage else []) + self.internal

    @property
    def urls(self) -> set[str]:
        return {normalise_url(page.url) for page in self.pages}


def extract_text(html: str, url: str) -> tuple[str, str]:
    """Return (title, readable text). trafilatura first, BeautifulSoup fallback."""
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


def collect_site(website: str) -> SiteContent:
    """Fetch homepage + internal pages. Never raises for network problems."""
    content = SiteContent()
    try:
        home = safe_fetch.fetch(website)
    except safe_fetch.FetchError as exc:
        content.failures.append(f"homepage: {exc.as_detail()}")
        return content

    if not home.ok or not home.text:
        content.failures.append(f"homepage: empty or non-OK response (http {home.status})")
        return content

    title, text = extract_text(home.text, home.url)
    if len(text.strip()) < 200:
        content.failures.append(f"homepage: only {len(text.strip())} chars of readable text")
        return content
    content.homepage = Page(url=home.url, title=title, text=text[:TEXT_FOR_HOME], status=home.status)

    for link in pick_internal_links(home.text, home.url):
        if link == home.url:
            continue
        try:
            page = safe_fetch.fetch(link)
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

    competitors = []
    for hint in profile.likely_competitors:
        if hint.website.startswith(("http://", "https://")) and hint.name.strip():
            competitors.append(hint)
    profile.likely_competitors = competitors[:10]

    seen = list(dict.fromkeys(profile.unverified + demoted))
    profile.unverified = seen[:30]
    return profile


def research_company(db, company) -> dict:
    """Run research for a company and persist the profile. Returns the stored dict."""
    import llm

    content = collect_site(company.website)
    if not content.pages:
        raise ResearchError(
            "Could not fetch any page from " + company.website + ": " + "; ".join(content.failures[:3])
        )

    profile = build_profile(company.name, company.context, content)
    stored = profile.model_dump()
    stored["_meta"] = {
        "pages_fetched": [page.url for page in content.pages],
        "fetch_failures": content.failures[:20],
        "model": llm.settings.groq_model,
        "intelligence": (company.profile or {}).get("intelligence", {}),
    }
    if company.profile and company.profile.get("intelligence"):
        stored["intelligence"] = company.profile["intelligence"]
    company.profile = stored
    db.commit()
    db.refresh(company)
    return stored
