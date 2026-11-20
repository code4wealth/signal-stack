"""Phase 2 tests: page selection, text extraction, evidence validation.

TEST_ fixtures only. Safe-fetch and the LLM are both mocked.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import db as db_module
import research
from db import Base, Company
from safe_fetch import FetchResult
from schemas import CompetitorHint, Fact, Profile

HOME_HTML = """
<html><head><title>TEST_Alpha - workflow tooling</title></head><body>
<nav><a href="/about">About</a> <a href="/pricing">Pricing</a>
<a href="/blog/post-1">Blog</a> <a href="https://elsewhere.test/x">Elsewhere</a>
<a href="/deck.pdf">Deck</a> <a href="/#top">Top</a></nav>
<script>var tracking = 1;</script>
<p>TEST_Alpha sells workflow automation to mid-market logistics teams.</p>
<p>""" + ("The platform connects warehouse, transport and billing systems so operations teams can "
        "close the loop between a shipment and its invoice without manual re-keying. " * 3) + """</p>
</body></html>
"""


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = maker()
    yield session, maker
    session.close()


def make_company(session, **overrides) -> Company:
    company = Company(
        name=overrides.get("name", "TEST_Alpha"),
        website=overrides.get("website", "https://alpha.test/"),
        context=overrides.get("context", "TEST context: selling into EU logistics"),
    )
    session.add(company)
    session.commit()
    return company


def fetch_result(url: str, text: str, status: int = 200) -> FetchResult:
    return FetchResult(url=url, status=status, text=text, content=text.encode(), content_type="text/html")


# --------------------------------------------------------------------------- #
# Link selection and extraction
# --------------------------------------------------------------------------- #
def test_pick_internal_links_keeps_same_site_and_ranks_keywords() -> None:
    links = research.pick_internal_links(HOME_HTML, "https://alpha.test/")

    assert all(link.startswith("https://alpha.test/") for link in links)
    assert "https://alpha.test/about" in links
    assert "https://alpha.test/pricing" in links
    assert not any(link.endswith(".pdf") for link in links)
    assert not any("elsewhere.test" in link for link in links)
    assert len(links) <= research.MAX_INTERNAL_PAGES + 5


def test_pick_internal_links_respects_limit() -> None:
    html = "<a href='/about'>a</a>" * 3 + "".join(
        f"<a href='/product/page{i}'>product</a>" for i in range(20)
    )
    assert len(research.pick_internal_links(html, "https://alpha.test/", limit=5)) == 5


def test_extract_text_drops_scripts_and_keeps_body() -> None:
    title, text = research.extract_text(HOME_HTML, "https://alpha.test/")
    assert "TEST_Alpha" in title
    assert "workflow automation" in text
    assert "var tracking" not in text


def test_extract_text_falls_back_when_trafilatura_yields_nothing(monkeypatch) -> None:
    import trafilatura

    monkeypatch.setattr(trafilatura, "extract", lambda *a, **k: "")
    _, text = research.extract_text("<html><body><p>fallback body text</p></body></html>", "https://a.test/")
    assert "fallback body text" in text


# --------------------------------------------------------------------------- #
# Profile validation - the anti-fabrication rule
# --------------------------------------------------------------------------- #
def test_facts_with_unfetched_evidence_are_demoted_to_unverified() -> None:
    profile = Profile(
        summary="TEST_Alpha automates logistics workflows.",
        products=[Fact(text="Workflow builder", evidence_url="https://alpha.test/about")],
        customers=[Fact(text="Mid-market logistics", evidence_url="https://invented.test/customers")],
        geography=[],
        differentiators=[],
        unverified=[],
    )

    cleaned = research.validate_profile(profile, {"https://alpha.test/about"})

    assert len(cleaned.products) == 1 and cleaned.products[0].verified is True
    assert cleaned.customers == []
    assert any("invented.test" in note for note in cleaned.unverified)


def test_competitors_without_http_url_are_dropped() -> None:
    profile = Profile(
        summary="x",
        likely_competitors=[
            CompetitorHint(name="TEST_Rival", website="https://rival.test"),
            CompetitorHint(name="TEST_Bad", website="rival dot test"),
        ],
    )
    cleaned = research.validate_profile(profile, set())
    assert [hint.name for hint in cleaned.likely_competitors] == ["TEST_Rival"]


# --------------------------------------------------------------------------- #
# Full research run, HTTP + LLM mocked
# --------------------------------------------------------------------------- #
def test_research_stores_profile_with_evidence_and_meta(session, monkeypatch) -> None:
    db_session, _maker = session
    company = make_company(db_session)

    pages = {
        "https://alpha.test/": HOME_HTML,
        "https://alpha.test/about": "<html><title>About</title><body>" + "About text " * 60 + "</body></html>",
        "https://alpha.test/pricing": "<html><title>Pricing</title><body>" + "Pricing text " * 60 + "</body></html>",
    }

    def fake_fetch(url, **_kwargs):
        if url in pages:
            return fetch_result(url, pages[url])
        raise research.safe_fetch.FetchFailed("http 404", url=url, status=404)

    monkeypatch.setattr(research.safe_fetch, "fetch", fake_fetch)

    captured: dict = {}

    def fake_ask(prompt, model_cls, **_kwargs):
        captured["prompt"] = prompt
        return Profile(
            summary="TEST_Alpha automates logistics workflows.",
            industry="logistics software",
            products=[Fact(text="Workflow automation", evidence_url="https://alpha.test/about")],
            customers=[Fact(text="Mid-market logistics teams", evidence_url="https://made-up.test/x")],
            unverified=["Possibly expanding into EU markets"],
            likely_competitors=[CompetitorHint(name="TEST_Rival", website="https://rival.test")],
        )

    monkeypatch.setattr("llm.ask", fake_ask)

    stored = research.research_company(db_session, company)

    assert stored["summary"].startswith("TEST_Alpha")
    assert stored["customers"] == []
    assert stored["_meta"]["pages_fetched"][0] == "https://alpha.test/"
    assert any("made-up.test" in note for note in stored["unverified"])
    assert "<untrusted_source" in captured["prompt"]
    assert "https://alpha.test/" in captured["prompt"]

    refreshed = db_session.get(Company, company.id)
    assert refreshed.profile["industry"] == "logistics software"


def test_research_raises_when_site_is_unreachable(session, monkeypatch) -> None:
    db_session, _maker = session
    company = make_company(db_session, website="https://dead.test/")

    def failing_fetch(url, **_kwargs):
        raise research.safe_fetch.FetchFailed("timeout after 15s", url=url)

    monkeypatch.setattr(research.safe_fetch, "fetch", failing_fetch)

    with pytest.raises(research.ResearchError, match="Could not fetch any page"):
        research.research_company(db_session, company)


def test_research_never_calls_llm_without_pages(session, monkeypatch) -> None:
    db_session, _maker = session
    company = make_company(db_session, website="https://dead.test/")
    monkeypatch.setattr(
        research.safe_fetch, "fetch", lambda url, **k: fetch_result(url, "<html></html>", status=200)
    )

    called = {"n": 0}
    monkeypatch.setattr("llm.ask", lambda *a, **k: called.__setitem__("n", called["n"] + 1))

    with pytest.raises(research.ResearchError):
        research.research_company(db_session, company)
    assert called["n"] == 0, "no pages -> no LLM call (no hallucinated profile)"
