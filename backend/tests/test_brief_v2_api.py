"""Tests for Monday Morning Brief v2 API."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import db as db_module
import main
from db import Company, Record, Report, Source


@pytest.fixture
def client():
    db_module.init_db()
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def db_session():
    db_module.init_db()
    db = db_module.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _seed_company_with_brief(db):
    company = Company(name="BriefCo", website="https://briefco.example", context="B2B SaaS")
    db.add(company)
    db.flush()

    src_cust = Source(
        company_id=company.id,
        name="Customer Forum",
        url="https://forum.briefco.example",
        category="customers",
        source_type="forum",
        status="approved",
        reliability=0.9,
    )
    src_comp = Source(
        company_id=company.id,
        name="Rival Changelog",
        url="https://rival.example/changelog",
        category="competitors",
        source_type="changelog",
        status="approved",
        reliability=0.95,
    )
    db.add_all([src_cust, src_comp])
    db.flush()

    rec1 = Record(
        company_id=company.id,
        source_id=src_cust.id,
        url="https://forum.briefco.example/thread-1",
        title="Enterprise SSO request",
        text="Customers are asking for SAML SSO before Q2 renewals.",
        content_hash="hash-rec-1",
        analysis={
            "title": "Enterprise buyers blocked on SAML SSO",
            "summary": "Three mid-market accounts flagged SAML SSO as a renewal blocker.",
            "evidence_verbatim": "We cannot renew in Q2 without SAML SSO support.",
            "why_it_matters": "Directly threatens 18% of Q2 ARR renewals.",
            "classification": "opportunity",
            "confidence": "high",
        },
        scores={"explanation": "High urgency renewal driver"},
        total=84.0,
        published=datetime(2026, 11, 16, tzinfo=timezone.utc),
    )
    rec2 = Record(
        company_id=company.id,
        source_id=src_comp.id,
        url="https://rival.example/changelog/ai-copilot",
        title="Rival launches AI pricing tier",
        text="Rival Inc launched usage-based AI tier at $29/seat.",
        content_hash="hash-rec-2",
        analysis={
            "title": "Rival cuts entry tier to $29/seat",
            "summary": "Rival launched a lower entry tier targeting SMB teams.",
            "evidence_verbatim": "Introducing Starter AI at $29 per seat.",
            "why_it_matters": "Puts downward price pressure on our Pro plan.",
            "classification": "threat",
            "confidence": "high",
        },
        scores={"explanation": "Direct competitive pricing move"},
        total=72.0,
        published=datetime(2026, 11, 17, tzinfo=timezone.utc),
    )
    db.add_all([rec1, rec2])
    db.flush()

    content = {
        "company": {"id": company.id, "name": company.name, "website": company.website},
        "generated_at": "2026-11-18T07:00:00+00:00",
        "unread": True,
        "status": "draft",
        "trigger": "scheduled",
        "automation_run_id": 42,
        "sections": [
            {
                "key": "executive_summary",
                "heading": "Executive Summary",
                "body": "Two critical developments this week.",
                "record_ids": [rec1.id, rec2.id],
            },
            {
                "key": "customer_signals",
                "heading": "Customer Signals",
                "body": "SSO demand is accelerating across enterprise renewals.",
                "record_ids": [rec1.id],
            },
            {
                "key": "competitor_moves",
                "heading": "Competitor Moves",
                "body": "Rival lowered entry pricing.",
                "record_ids": [rec2.id],
            },
            {
                "key": "market_shifts",
                "heading": "Market & Regulatory Shifts",
                "body": "No meaningful verified development was identified during this monitoring period.",
                "record_ids": [],
            },
            {
                "key": "founder_intelligence",
                "heading": "Founder Intelligence",
                "body": "No meaningful verified development was identified during this monitoring period.",
                "record_ids": [],
            },
            {
                "key": "risks_watchlist",
                "heading": "Risks & Watchlist",
                "body": "Watch Rival Q4 enterprise rollout.",
                "record_ids": [rec2.id],
            },
        ],
        "top_signals": [
            {"id": rec1.id, "title": "Enterprise buyers blocked on SAML SSO"},
            {"id": rec2.id, "title": "Rival cuts entry tier to $29/seat"},
        ],
        "opportunities": [
            {
                "opportunity": "Ship SAML SSO add-on for Pro accounts",
                "evidence": "Three renewal blockers cited SAML.",
                "relevance": "Protects Q2 renewals and unlocks $15k expansion.",
                "impact": "High ARR retention",
                "next_step": "Scope Okta integration",
                "priority": "high",
                "record_ids": [rec1.id],
            }
        ],
        "risks": [
            {
                "risk": "SMB price undercutting from Rival",
                "mitigation": "Bundle onboarding templates into Pro.",
                "record_ids": [rec2.id],
            }
        ],
        "actions": [
            {
                "id": "act-0",
                "action": "Publish SAML SSO beta timeline to top 5 accounts",
                "owner": "Founder",
                "why": "De-risks Q2 renewals.",
                "record_ids": [rec1.id],
                "done": False,
                "effort": "medium",
            }
        ],
        "counts": {"records": 2, "sources": 2},
        "dropped_actions": 1,
        "model": "llama-3.3-70b",
    }
    report1 = Report(company_id=company.id, content=content, markdown="# Brief 1")
    db.add(report1)
    db.commit()
    db.refresh(report1)
    return company, report1, rec1, rec2


def test_brief_v2_latest_view_actions_notes_watch_and_compare(client, db_session):
    company, report1, rec1, rec2 = _seed_company_with_brief(db_session)

    # Latest brief
    r = client.get(f"/api/companies/{company.id}/briefs/latest")
    assert r.status_code == 200
    body = r.json()
    brief = body["brief"]
    assert brief["id"] == str(report1.id)
    assert brief["version"] == 1
    assert brief["unread"] is True
    assert brief["trigger"] == "scheduled"
    assert brief["automationRunId"] == "42"
    assert brief["removedUnsupportedClaims"] == 1
    assert len(brief["executiveSummary"]) == 2
    assert len(brief["sources"]) >= 2
    assert brief["sources"][0]["n"] == 1
    assert brief["sources"][0]["usedIn"]
    assert len(brief["opportunities"]) == 1
    opp = brief["opportunities"][0]
    assert opp["evidence"]["text"]
    assert opp["businessRelevance"]
    assert opp["impact"]
    assert opp["nextStep"]
    assert opp["priority"] in ("high", "medium", "low")
    assert "Only 1 verified opportunity" in (brief["opportunitiesNote"] or "")

    # Fetch specific brief clears unread
    r_get = client.get(f"/api/companies/{company.id}/briefs/{report1.id}")
    assert r_get.status_code == 200
    assert r_get.json()["unread"] is False

    # Update action
    r_act = client.patch(
        f"/api/companies/{company.id}/briefs/{report1.id}/actions/act-0",
        json={"done": True, "owner": "Alex", "dueDate": "2026-11-25"},
    )
    assert r_act.status_code == 200
    assert r_act.json()["done"] is True
    assert r_act.json()["owner"] == "Alex"

    # Add custom action
    r_new_act = client.post(
        f"/api/companies/{company.id}/briefs/{report1.id}/actions",
        json={"text": "Review competitor pricing matrix", "owner": "PM", "effort": "low"},
    )
    assert r_new_act.status_code == 201
    assert r_new_act.json()["isCustom"] is True

    # Notes & ready status
    r_patch = client.patch(
        f"/api/companies/{company.id}/briefs/{report1.id}",
        json={"status": "ready", "notes": [{"sectionKey": "customers", "text": "Discussed in Monday sync"}]},
    )
    assert r_patch.status_code == 200
    assert r_patch.json()["status"] == "ready"
    assert r_patch.json()["notes"][0]["text"] == "Discussed in Monday sync"

    # Toggle watchlist
    r_wl = client.post(f"/api/companies/{company.id}/watchlist/{rec2.id}/toggle")
    assert r_wl.status_code == 200
    assert r_wl.json()["inWatchlist"] is True

    # Feedback & PDF fallback & Email validation
    r_fb = client.post(
        f"/api/companies/{company.id}/briefs/{report1.id}/feedback",
        json={"useful": True, "comment": "Sharp summary"},
    )
    assert r_fb.status_code == 200
    assert r_fb.json()["useful"] is True

    r_pdf = client.get(f"/api/companies/{company.id}/briefs/{report1.id}/pdf")
    assert r_pdf.status_code == 501

    # Email stub endpoint removed: must never return {"sent": true}
    r_no_email = client.post(
        f"/api/companies/{company.id}/briefs/{report1.id}/email",
        json={"to": "founder@example.com"},
    )
    assert r_no_email.status_code in (404, 405)
    assert "emailConfigured" not in body
    assert "emailConfigured" not in body["brief"]
    auto_res = client.get(f"/api/companies/{company.id}/automation")
    assert auto_res.status_code == 200
    assert "emailConfigured" not in auto_res.json()["capabilities"]

    # History & compare
    report2 = Report(company_id=company.id, content={**report1.content, "top_signals": [{"id": rec1.id}]}, markdown="# Brief 2")
    db_session.add(report2)
    db_session.commit()
    db_session.refresh(report2)

    r_hist = client.get(f"/api/companies/{company.id}/briefs")
    assert r_hist.status_code == 200
    assert r_hist.json()["total"] == 2

    r_cmp = client.get(f"/api/companies/{company.id}/briefs/compare?a={report1.id}&b={report2.id}")
    assert r_cmp.status_code == 200
    assert "Rival cuts entry tier to $29/seat" in r_cmp.json()["removed"]


def test_brief_v2_empty_prerequisites(client, db_session):
    company = Company(name="EmptyCo", website="https://empty.example")
    db_session.add(company)
    db_session.commit()

    r = client.get(f"/api/companies/{company.id}/briefs/latest")
    assert r.status_code == 200
    assert r.json()["brief"] is None
    assert r.json()["prerequisites"]["ready"] is False

    r_gen = client.post(f"/api/companies/{company.id}/briefs/generate")
    assert r_gen.status_code == 400
