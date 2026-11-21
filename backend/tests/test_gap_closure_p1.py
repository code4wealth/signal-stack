"""Tests for Gap Batch 1B: analysis classification, brief opportunities/risks, internal insights, context comparison."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import analysis
import brief
import context as context_module
import db as db_module
import discovery
import documents
import main
from db import Base, Company, Record, Source
from schemas import Analysis, BriefAction, BriefDraft, BriefOpportunity, BriefRisk, SectionProse


@pytest.fixture
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = maker()
    yield db
    db.close()


def test_analysis_stores_classification_opportunity_threat_neutral_uncertain(session) -> None:
    company = Company(name="TEST_Class", website="https://class.test", context="TEST")
    session.add(company)
    session.flush()
    source = Source(company_id=company.id, name="S", url="https://class.test/feed", category="market", status="approved")
    session.add(source)
    session.flush()
    record = Record(
        company_id=company.id,
        source_id=source.id,
        url="https://class.test/p",
        title="New grant",
        text="The ministry launched a new scholarship grant covering international students.",
        content_hash="a" * 64,
        discovered=datetime.now(timezone.utc),
    )
    payload = Analysis(
        title="New grant",
        summary="Ministry launched scholarship grant.",
        evidence_snippet="launched a new scholarship grant covering international students",
        relevance=0.9,
        impact=0.8,
        urgency=0.6,
        strategic_relevance=0.8,
        evidence_strength=0.9,
        classification="opportunity",
    )
    stored = analysis.apply_analysis(record, payload, source)
    assert stored["classification"] == "opportunity"


def test_brief_validates_structured_opportunities_and_risks_and_drops_ungrounded(session, monkeypatch) -> None:
    company = Company(name="TEST_Opp", website="https://opp.test", context="TEST", profile={"summary": "TEST"})
    session.add(company)
    session.flush()
    source = Source(company_id=company.id, name="M", url="https://m.test", category="market", status="approved")
    session.add(source)
    session.flush()
    rec = Record(
        company_id=company.id,
        source_id=source.id,
        url="https://m.test/1",
        title="Visa rule",
        text="Visa rule text",
        content_hash="b" * 64,
        total=82.0,
        analysis={"title": "Visa rule", "summary": "New visa window.", "evidence_verbatim": True},
    )
    session.add(rec)
    session.commit()

    def fake_ask(*_a, **_k):
        return BriefDraft(
            executive_summary="Summary.",
            executive_record_ids=[rec.id],
            market_shifts=SectionProse(body="Visa window opened.", record_ids=[rec.id]),
            strategic_implications=SectionProse(body="Target visa applicants.", record_ids=[rec.id]),
            risks_watchlist=SectionProse(body="Compliance risk.", record_ids=[rec.id]),
            opportunities=[
                BriefOpportunity(
                    opportunity="Launch fast-track visa advisory",
                    evidence="New visa window opened.",
                    relevance="High for overseas applicants",
                    impact="Increases Q1 qualified leads",
                    next_step="Update landing page",
                    priority="high",
                    record_ids=[rec.id, 99999],
                ),
                BriefOpportunity(
                    opportunity="Ungrounded opportunity",
                    evidence="Invented",
                    relevance="Low",
                    impact="None",
                    next_step="Ignore",
                    priority="low",
                    record_ids=[88888],
                ),
            ],
            risks=[
                BriefRisk(
                    risk="Deadline slippage",
                    mitigation="Automate compliance reminders",
                    record_ids=[rec.id],
                ),
                BriefRisk(
                    risk="Hallucinated risk",
                    mitigation="N/A",
                    record_ids=[77777],
                ),
            ],
            actions=[BriefAction(action="Publish visa checklist", record_ids=[rec.id])],
        )

    monkeypatch.setattr("llm.ask", fake_ask)
    report = brief.generate(session, company)

    assert len(report.content["opportunities"]) == 1
    assert report.content["opportunities"][0]["opportunity"] == "Launch fast-track visa advisory"
    assert report.content["opportunities"][0]["record_ids"] == [rec.id]
    assert len(report.content["risks"]) == 1
    assert report.content["risks"][0]["mitigation"] == "Automate compliance reminders"
    assert "Launch fast-track visa advisory" in report.markdown
    assert "Automate compliance reminders" in report.markdown


def test_internal_document_type_and_extracted_insights() -> None:
    with TestClient(main.app) as client:
        company = client.post(
            "/api/companies",
            json={"name": "TEST_Docs", "website": "https://docs.test", "context": "TEST"},
        ).json()
        csv_payload = (
            b"ticket_id,category,summary\n"
            b"1,complaint,Portal login loop blocks counsellors during peak intake\n"
            b"2,objection,Pricing is too expensive compared to local agencies\n"
            b"3,lost_deal,Lost deal because visa checklist feature was missing\n"
            b"4,feature_request,Feature request for automated scholarship eligibility filter\n"
        )
        res = client.post(
            f"/api/companies/{company['id']}/documents",
            data={"document_type": "support_tickets"},
            files={"file": ("tickets.csv", csv_payload, "text/csv")},
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["document_type"] == "support_tickets"
        insights = body["insights"]
        assert len(insights["complaints"]) >= 1
        assert len(insights["objections"]) >= 1
        assert len(insights["lost_deal_reasons"]) >= 1
        assert len(insights["product_requests"]) >= 1

        listed = client.get(f"/api/companies/{company['id']}/documents").json()
        assert listed["items"][0]["document_type"] == "support_tickets"
        assert "insights" in listed["items"][0]


def test_context_reassess_includes_profile_comparison(session, monkeypatch) -> None:
    company = Company(
        name="TEST_Ctx",
        website="https://ctx.test",
        context="Domestic university discovery",
        profile={"summary": "TEST summary", "industry": "edtech"},
    )
    session.add(company)
    session.flush()
    src = Source(company_id=company.id, name="Domestic", url="https://dom.test", category="market", status="approved")
    session.add(src)
    session.commit()

    monkeypatch.setattr(
        "llm.ask",
        lambda *a, **k: context_module.RelevanceBatch(
            items=[context_module.RelevanceItem(source_id=src.id, relevance=0.2, reason="Domestic only.")]
        ),
    )
    monkeypatch.setattr(discovery, "discover", lambda db, c: {"created_count": 1, "dropped_count": 0, "counts_by_category": {}})

    result = context_module.reassess(session, company, "International student recruitment")
    comp = result["profile_comparison"]
    assert comp["previous_context"] == "Domestic university discovery"
    assert comp["new_context"] == "International student recruitment"
    assert "explanation" in comp and comp["recommended_removal_count"] == 1
