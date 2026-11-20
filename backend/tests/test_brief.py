"""Phase 6 tests: 11 sections, citation validation, exact empty sentence, action dropping."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import brief
from db import Base, Company, Record, Report, Source
from schemas import BriefAction, BriefDraft, SectionProse

EMPTY = "No meaningful verified development was identified during this monitoring period."


@pytest.fixture
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = maker()
    yield db
    db.close()


def seed(db):
    company = Company(
        name="TEST_Brief Co",
        website="https://brief.test",
        context="TEST context",
        profile={
            "summary": "TEST_Brief Co sells workflow software.",
            "products": [{"text": "Workflow engine", "evidence_url": "https://brief.test/about", "verified": True}],
            "unverified": ["May expand into freight forwarding"],
            "intelligence": {"founder_answers": [{"question": "Q?", "answer": "A.", "is_followup": False}]},
        },
    )
    db.add(company)
    db.flush()

    market = Source(company_id=company.id, name="TEST market", url="https://m.test/feed",
                    category="market", status="approved", reliability=0.9)
    customers = Source(company_id=company.id, name="TEST customers", url="https://c.test/news",
                       category="customers", status="approved", reliability=0.7)
    db.add_all([market, customers])
    db.flush()

    rows = [
        Record(company_id=company.id, source_id=market.id, url="https://m.test/1", title="Regulator opens consultation",
               text="text", content_hash="a" * 64, total=88.0,
               analysis={"title": "Regulator opens consultation", "summary": "A consultation started.",
                         "relevance": 0.9, "impact": 0.8, "urgency": 0.7, "evidence_verbatim": True}),
        Record(company_id=company.id, source_id=customers.id, url="https://c.test/1", title="Customer expands",
               text="text", content_hash="b" * 64, total=76.0,
               analysis={"title": "Customer expands", "summary": "A customer expanded.",
                         "relevance": 0.8, "impact": 0.7, "urgency": 0.5, "evidence_verbatim": True}),
        Record(company_id=company.id, source_id=market.id, url="https://m.test/2", title="Funding round",
               text="text", content_hash="c" * 64, total=55.0,
               analysis={"title": "Funding round", "summary": "A competitor raised money.",
                         "relevance": 0.6, "impact": 0.5, "urgency": 0.4, "evidence_verbatim": False}),
    ]
    db.add_all(rows)
    db.commit()
    return company, rows


def draft_with_bad_ids(rows) -> BriefDraft:
    return BriefDraft(
        executive_summary="Two verified developments matter this week.",
        executive_record_ids=[rows[0].id, 9999],  # 9999 does not exist
        customer_signals=SectionProse(body="A customer expanded its footprint.", record_ids=[rows[1].id]),
        competitor_moves=SectionProse(body="", record_ids=[]),
        market_shifts=SectionProse(body="A regulator opened a consultation.", record_ids=[rows[0].id, 8888]),
        founder_intelligence=SectionProse(body="", record_ids=[]),
        strategic_implications=SectionProse(body="Pricing pressure is likely.", record_ids=[rows[2].id]),
        risks_watchlist=SectionProse(body="Unexplained risk claim.", record_ids=[7777]),
        actions=[
            BriefAction(action="Prepare consultation response", record_ids=[rows[0].id]),
            BriefAction(action="Invented action", record_ids=[4242]),
        ],
    )


# --------------------------------------------------------------------------- #
# Sections and citations
# --------------------------------------------------------------------------- #
def test_brief_has_exactly_eleven_sections_in_order(session, monkeypatch) -> None:
    company, rows = seed(session)
    monkeypatch.setattr("llm.ask", lambda *a, **k: draft_with_bad_ids(rows))

    report = brief.generate(session, company)

    headings = [section["heading"] for section in report.content["sections"]]
    assert headings == brief.SECTION_HEADINGS
    assert len(headings) == 11


def test_invalid_citation_ids_are_stripped(session, monkeypatch) -> None:
    company, rows = seed(session)
    monkeypatch.setattr("llm.ask", lambda *a, **k: draft_with_bad_ids(rows))

    report = brief.generate(session, company)

    valid_ids = {record.id for record in rows}
    for section in report.content["sections"]:
        assert set(section["record_ids"]) <= valid_ids, section
    executive = next(s for s in report.content["sections"] if s["key"] == "executive_summary")
    assert executive["record_ids"] == [rows[0].id]


def test_section_with_only_invalid_citations_falls_back_to_empty_sentence(session, monkeypatch) -> None:
    company, rows = seed(session)
    monkeypatch.setattr("llm.ask", lambda *a, **k: draft_with_bad_ids(rows))

    report = brief.generate(session, company)

    risks = next(s for s in report.content["sections"] if s["key"] == "risks_watchlist")
    assert risks["body"] == EMPTY
    assert risks["record_ids"] == []


def test_category_without_records_uses_exact_sentence(session, monkeypatch) -> None:
    company, rows = seed(session)
    monkeypatch.setattr("llm.ask", lambda *a, **k: draft_with_bad_ids(rows))

    report = brief.generate(session, company)

    internal = next(s for s in report.content["sections"] if s["key"] == "founder_intelligence")
    competitors = next(s for s in report.content["sections"] if s["key"] == "competitor_moves")
    assert internal["body"] == EMPTY
    assert competitors["body"] == EMPTY


def test_actions_without_valid_evidence_are_dropped(session, monkeypatch) -> None:
    company, rows = seed(session)
    monkeypatch.setattr("llm.ask", lambda *a, **k: draft_with_bad_ids(rows))

    report = brief.generate(session, company)

    actions = report.content["actions"]
    assert [action["action"] for action in actions] == ["Prepare consultation response"]
    assert report.content["dropped_actions"] == 1
    assert actions[0]["done"] is False
    assert actions[0]["record_ids"] == [rows[0].id]


def test_top_five_is_chosen_by_code(session, monkeypatch) -> None:
    company, rows = seed(session)
    monkeypatch.setattr("llm.ask", lambda *a, **k: draft_with_bad_ids(rows))

    report = brief.generate(session, company)

    top = next(s for s in report.content["sections"] if s["key"] == "top_signals")
    assert top["record_ids"] == [rows[0].id, rows[1].id, rows[2].id]
    assert "88.0/100" in top["body"]
    assert "Why it ranks here" in top["body"]


# --------------------------------------------------------------------------- #
# Persistence, markdown, guards
# --------------------------------------------------------------------------- #
def test_report_is_persisted_with_markdown(session, monkeypatch) -> None:
    company, rows = seed(session)
    monkeypatch.setattr("llm.ask", lambda *a, **k: draft_with_bad_ids(rows))

    report = brief.generate(session, company)

    stored = session.scalars(select(Report)).one()
    assert stored.id == report.id
    assert "## Executive Summary" in stored.markdown
    assert "## Record index" in stored.markdown
    assert "- [ ] **Prepare consultation response**" in stored.markdown
    assert EMPTY in stored.markdown  # empty categories appear with the exact sentence


def test_generate_requires_analysed_records(session) -> None:
    company = Company(name="TEST_Empty", website="https://e.test", context="")
    session.add(company)
    session.commit()

    with pytest.raises(brief.BriefError, match="No analysed records"):
        brief.generate(session, company)


def test_markdown_export_contains_every_citation(session, monkeypatch) -> None:
    company, rows = seed(session)
    monkeypatch.setattr("llm.ask", lambda *a, **k: draft_with_bad_ids(rows))

    report = brief.generate(session, company)
    markdown = brief.render_markdown(report.content)

    for record in rows:
        assert f"record {record.id}" in markdown
