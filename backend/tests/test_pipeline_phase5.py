"""Phase 5 tests: hashing/dedup, crawl semantics, verbatim evidence, ranking math."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import analysis
import crawler
import ranking
from db import Base, Company, JobLog, Record, Source
from safe_fetch import FetchFailed, FetchResult
from schemas import Analysis

ARTICLE = (
    "<html><head><title>TEST article</title></head><body>"
    "<p>TEST_Alpha announced a partnership with a European freight operator. "
    "The deal covers three distribution centres and starts in the second quarter. "
    "Terms were not disclosed. The rollout is expected to finish before the end of the fiscal "
    "year and covers inbound and outbound movements across the network.</p>"
    "<p>The operator said integration work is already under way with its existing warehouse "
    "management system, and that two further sites are under consideration for next year.</p>"
    "</body></html>"
)
FEED_XML = """<?xml version="1.0"?><rss version="2.0"><channel><title>TEST feed</title>
<item><title>TEST entry one</title><link>https://src.test/entry-1</link>
<description>TEST feed summary about a new logistics customer win in Germany this quarter
with three sites going live in April and further rollouts planned later in the year.</description>
<pubDate>Wed, 12 Nov 2025 08:00:00 GMT</pubDate></item>
</channel></rss>"""


@pytest.fixture
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = maker()
    yield db
    db.close()


def make_company(db) -> Company:
    company = Company(name="TEST_Hash", website="https://alpha.test", context="TEST", profile={"summary": "TEST"})
    db.add(company)
    db.commit()
    return company


def make_source(db, company, **kw) -> Source:
    source = Source(
        company_id=company.id,
        name=kw.get("name", "TEST source"),
        url=kw.get("url", "https://src.test/news"),
        category=kw.get("category", "market"),
        status=kw.get("status", "approved"),
        reliability=kw.get("reliability", 0.8),
        feed_url=kw.get("feed_url"),
    )
    db.add(source)
    db.commit()
    return source


class FakeWeb:
    """Maps url -> (html, etag) and records what was requested."""

    def __init__(self, pages: dict[str, str], etags: dict[str, str] | None = None):
        self.pages = pages
        self.etags = etags or {}
        self.requests: list[tuple[str, str | None]] = []

    def __call__(self, url, etag=None, last_modified=None, **_kwargs):
        self.requests.append((url, etag))
        if url not in self.pages:
            raise FetchFailed("http 404", url=url, status=404)
        stored_etag = self.etags.get(url)
        if etag and stored_etag and etag == stored_etag:
            return FetchResult(url=url, status=304, text="", content=b"", not_modified=True, etag=stored_etag)
        body = self.pages[url]
        return FetchResult(
            url=url,
            status=200,
            text=body,
            content=body.encode(),
            content_type="text/html",
            etag=stored_etag,
        )


# --------------------------------------------------------------------------- #
# Hashing
# --------------------------------------------------------------------------- #
def test_content_hash_ignores_whitespace_and_case() -> None:
    assert crawler.content_hash("Hello   World\n") == crawler.content_hash("hello world")
    assert crawler.content_hash("hello world") != crawler.content_hash("hello there")


# --------------------------------------------------------------------------- #
# Crawl semantics (AC6)
# --------------------------------------------------------------------------- #
def test_crawl_creates_record_with_url_time_and_hash(session, monkeypatch) -> None:
    company = make_company(session)
    source = make_source(session, company)
    monkeypatch.setattr(crawler.safe_fetch, "fetch", FakeWeb({source.url: ARTICLE}))

    summary = crawler.crawl_company(session, company, concurrency=1)

    records = session.scalars(select(Record)).all()
    assert summary["new_records"] == 1 and len(records) == 1
    record = records[0]
    assert record.url == source.url
    assert record.discovered is not None
    assert len(record.content_hash) == 64
    assert record.source_id == source.id
    assert "partnership" in record.text


def test_second_crawl_creates_no_duplicates(session, monkeypatch) -> None:
    company = make_company(session)
    source = make_source(session, company)
    monkeypatch.setattr(crawler.safe_fetch, "fetch", FakeWeb({source.url: ARTICLE}))

    crawler.crawl_company(session, company, concurrency=1)
    second = crawler.crawl_company(session, company, concurrency=1)

    assert second["new_records"] == 0
    assert second["duplicates"] == 1
    assert session.query(Record).count() == 1


def test_changed_page_at_same_url_is_stored_as_updated(session, monkeypatch) -> None:
    company = make_company(session)
    source = make_source(session, company)
    web = FakeWeb({source.url: ARTICLE})
    monkeypatch.setattr(crawler.safe_fetch, "fetch", web)
    crawler.crawl_company(session, company, concurrency=1)

    web.pages[source.url] = ARTICLE.replace(
        "Terms were not disclosed.", "Terms were disclosed as a three year agreement."
    )
    summary = crawler.crawl_company(session, company, concurrency=1)

    records = session.scalars(select(Record).order_by(Record.id)).all()
    assert summary["updated_records"] == 1 and len(records) == 2
    assert records[-1].is_update is True
    assert records[-1].title.startswith("[UPDATED]")
    assert records[0].content_hash != records[1].content_hash


def test_duplicate_content_under_different_urls_is_skipped(session, monkeypatch) -> None:
    company = make_company(session)
    first = make_source(session, company, url="https://src.test/a")
    second = make_source(session, company, url="https://src.test/b")
    monkeypatch.setattr(
        crawler.safe_fetch, "fetch", FakeWeb({first.url: ARTICLE, second.url: ARTICLE})
    )

    crawler.crawl_company(session, company, concurrency=1)

    assert session.query(Record).count() == 1, "identical text under a new URL must not create a record"


def test_only_approved_sources_are_crawled(session, monkeypatch) -> None:
    company = make_company(session)
    make_source(session, company, url="https://src.test/approved", status="approved")
    make_source(session, company, url="https://src.test/pending", status="pending")
    web = FakeWeb(
        {"https://src.test/approved": ARTICLE, "https://src.test/pending": ARTICLE.replace("Alpha", "Beta")}
    )
    monkeypatch.setattr(crawler.safe_fetch, "fetch", web)

    crawler.crawl_company(session, company, concurrency=1)

    assert [url for url, _ in web.requests] == ["https://src.test/approved"]


def test_crawl_with_no_approved_sources_is_reported(session) -> None:
    company = make_company(session)
    make_source(session, company, status="pending")
    summary = crawler.crawl_company(session, company, concurrency=1)
    assert summary["sources_checked"] == 0
    assert "approve" in summary["message"]


def test_failure_is_recorded_on_the_source(session, monkeypatch) -> None:
    company = make_company(session)
    source = make_source(session, company, url="https://src.test/broken")
    monkeypatch.setattr(crawler.safe_fetch, "fetch", FakeWeb({}))

    summary = crawler.crawl_company(session, company, concurrency=1)

    session.refresh(source)
    assert summary["errors"] == 1
    assert source.health == "error"
    assert "404" in (source.last_error or "")
    assert source.last_checked is not None


def test_conditional_get_304_creates_no_record(session, monkeypatch) -> None:
    company = make_company(session)
    source = make_source(session, company)
    web = FakeWeb({source.url: ARTICLE}, etags={source.url: '"v1"'})
    monkeypatch.setattr(crawler.safe_fetch, "fetch", web)

    crawler.crawl_company(session, company, concurrency=1)
    session.refresh(source)
    assert source.etag == '"v1"'

    second = crawler.crawl_company(session, company, concurrency=1)
    assert second["not_modified"] == 1
    assert session.query(Record).count() == 1
    assert web.requests[-1] == (source.url, '"v1"'), "etag must be sent back on the second crawl"


def test_rss_feed_entries_become_records(session, monkeypatch) -> None:
    company = make_company(session)
    source = make_source(session, company, feed_url="https://src.test/feed.xml")
    entry_html = "<html><body><p>" + ("TEST entry body text about distribution centres. " * 12) + "</p></body></html>"
    web = FakeWeb(
        {
            source.url: ARTICLE,
            "https://src.test/feed.xml": FEED_XML,
            "https://src.test/entry-1": entry_html,
        }
    )
    monkeypatch.setattr(crawler.safe_fetch, "fetch", web)

    crawler.crawl_company(session, company, concurrency=1)

    urls = {record.url for record in session.scalars(select(Record)).all()}
    assert "https://src.test/entry-1" in urls
    entry = session.scalars(select(Record).where(Record.url == "https://src.test/entry-1")).one()
    assert entry.published is not None


def test_crawl_writes_a_job_log(session, monkeypatch) -> None:
    company = make_company(session)
    source = make_source(session, company)
    monkeypatch.setattr(crawler.safe_fetch, "fetch", FakeWeb({source.url: ARTICLE}))

    crawler.crawl_company(session, company, concurrency=1)

    log = session.scalars(select(JobLog).where(JobLog.job == "crawl")).one()
    assert log.status == "ok" and '"new_records": 1' in log.detail


# --------------------------------------------------------------------------- #
# Ranking (AC9)
# --------------------------------------------------------------------------- #
def test_weights_match_the_prd() -> None:
    assert ranking.WEIGHTS == {
        "relevance": 0.25,
        "impact": 0.25,
        "urgency": 0.15,
        "credibility": 0.15,
        "recency": 0.10,
        "novelty": 0.10,
    }
    assert abs(sum(ranking.WEIGHTS.values()) - 1.0) < 1e-9


def test_score_is_the_weighted_sum() -> None:
    now = datetime(2026, 1, 31, tzinfo=timezone.utc)
    scored = ranking.score_record(
        relevance=1.0,
        impact=1.0,
        urgency=1.0,
        credibility=1.0,
        published=now,
        discovered=now,
        is_update=False,
        now=now,
    )
    assert scored["total"] == pytest.approx(100.0)
    assert scored["components"]["recency"] == pytest.approx(1.0)
    assert scored["components"]["novelty"] == 1.0


def test_zero_inputs_score_zero() -> None:
    now = datetime(2026, 1, 31, tzinfo=timezone.utc)
    scored = ranking.score_record(
        relevance=0.0,
        impact=0.0,
        urgency=0.0,
        credibility=0.0,
        published=now - timedelta(days=60),
        discovered=now - timedelta(days=60),
        is_update=True,
        now=now,
    )
    # every component is zero except novelty, which contributes 0.10 * 0.3 = 3 points
    assert scored["total"] == pytest.approx(3.0)


def test_recency_decays_over_thirty_days() -> None:
    now = datetime(2026, 1, 31, tzinfo=timezone.utc)
    assert ranking.recency_component(now, now, now) == pytest.approx(1.0)
    assert ranking.recency_component(now - timedelta(days=15), None, now) == pytest.approx(0.5)
    assert ranking.recency_component(now - timedelta(days=45), None, now) == 0.0


def test_novelty_penalises_updates() -> None:
    assert ranking.novelty_component(False) == 1.0
    assert ranking.novelty_component(True) == 0.3


def test_explanation_names_every_component() -> None:
    now = datetime(2026, 1, 31, tzinfo=timezone.utc)
    scored = ranking.score_record(
        relevance=0.8, impact=0.6, urgency=0.4, credibility=0.7,
        published=now - timedelta(days=3), discovered=now, is_update=False, now=now,
    )
    text = scored["explanation"]
    for key in ranking.WEIGHTS:
        assert key in text
    assert "weight 0.25" in text
    assert f"{scored['total']:.2f}/100" in text


# --------------------------------------------------------------------------- #
# Analysis: verbatim evidence
# --------------------------------------------------------------------------- #
def analysis_payload(snippet: str, strength: float = 0.9) -> Analysis:
    return Analysis(
        title="Partnership announcement",
        summary="TEST_Alpha signed a freight partnership.",
        evidence_snippet=snippet,
        relevance=0.8, impact=0.6, urgency=0.4,
        strategic_relevance=0.7, evidence_strength=strength,
    )


def test_snippet_matching_tolerates_whitespace_only() -> None:
    text = "The deal   covers three distribution\ncentres and starts in the second quarter."
    assert analysis.snippet_is_verbatim("The deal covers three distribution centres", text)
    assert not analysis.snippet_is_verbatim("The deal covers five distribution centres", text)
    assert not analysis.snippet_is_verbatim("too short", text)


def test_verbatim_snippet_keeps_strength(session) -> None:
    company = make_company(session)
    source = make_source(session, company)
    record = Record(company_id=company.id, source_id=source.id, url="https://src.test/a",
                    title="t", text="The deal covers three distribution centres and starts in Q2.",
                    content_hash="x" * 64, discovered=datetime.now(timezone.utc))
    stored = analysis.apply_analysis(record, analysis_payload("The deal covers three distribution centres"), source)
    assert stored["evidence_verbatim"] is True
    assert stored["evidence_strength"] == 0.9
    assert "flag" not in stored


def test_fabricated_snippet_is_capped_and_flagged(session) -> None:
    company = make_company(session)
    source = make_source(session, company)
    record = Record(company_id=company.id, source_id=source.id, url="https://src.test/a",
                    title="t", text="The deal covers three distribution centres and starts in Q2.",
                    content_hash="y" * 64, discovered=datetime.now(timezone.utc))
    stored = analysis.apply_analysis(record, analysis_payload("Revenue tripled after the acquisition"), source)
    assert stored["evidence_verbatim"] is False
    assert stored["evidence_strength"] == 0.2
    assert "not found verbatim" in stored["flag"]


def test_three_separate_stored_fields(session) -> None:
    company = make_company(session)
    source = make_source(session, company, reliability=0.65)
    record = Record(company_id=company.id, source_id=source.id, url="https://src.test/a", title="t",
                    text="The deal covers three distribution centres and starts in Q2.",
                    content_hash="z" * 64, discovered=datetime.now(timezone.utc))
    stored = analysis.apply_analysis(record, analysis_payload("The deal covers three distribution centres", 0.75), source)
    assert stored["source_reliability"] == 0.65
    assert stored["evidence_strength"] == 0.75
    assert stored["strategic_relevance"] == 0.7
    assert record.total > 0


def test_analyse_pending_respects_cap_and_logs(session, monkeypatch) -> None:
    company = make_company(session)
    source = make_source(session, company)
    for i in range(5):
        session.add(Record(company_id=company.id, source_id=source.id, url=f"https://src.test/{i}",
                           title=f"t{i}", text=f"Document {i}. The deal covers three distribution centres.",
                           content_hash=str(i) * 64, discovered=datetime.now(timezone.utc)))
    session.commit()

    calls = {"n": 0}

    def fake_ask(prompt, model_cls, **_kwargs):
        calls["n"] += 1
        return analysis_payload("The deal covers three distribution centres")

    monkeypatch.setattr("llm.ask", fake_ask)

    summary = analysis.analyse_pending(session, company, limit=2, sleep_seconds=0)

    assert summary["analysed"] == 2 and calls["n"] == 2
    assert summary["cap_per_run"] == 2
    assert session.scalars(select(JobLog).where(JobLog.job == "analyse")).one().status == "ok"


def test_analysis_failure_does_not_stop_the_run(session, monkeypatch) -> None:
    company = make_company(session)
    source = make_source(session, company)
    for i in range(3):
        session.add(Record(company_id=company.id, source_id=source.id, url=f"https://src.test/{i}",
                           title=f"t{i}", text=f"Document {i}. The deal covers three distribution centres.",
                           content_hash=str(i + 5) * 64, discovered=datetime.now(timezone.utc)))
    session.commit()

    state = {"n": 0}

    def flaky_ask(prompt, model_cls, **_kwargs):
        state["n"] += 1
        if state["n"] == 1:
            raise RuntimeError("groq unavailable")
        return analysis_payload("The deal covers three distribution centres")

    monkeypatch.setattr("llm.ask", flaky_ask)
    summary = analysis.analyse_pending(session, company, sleep_seconds=0)

    assert summary["analysed"] == 2 and summary["failed"] == 1
    assert session.scalars(select(JobLog).where(JobLog.job == "analyse")).one().status == "partial"
