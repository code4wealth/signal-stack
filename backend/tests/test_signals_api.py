from __future__ import annotations

from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

import db as db_module
import main
from db import Company, JobLog, Record, Source


def _seed_signals_company() -> tuple[int, dict[str, int]]:
    db_module.init_db()
    now = datetime.now(timezone.utc)
    with db_module.SessionLocal() as session:
        company = Company(
            name="SigTestCo",
            website="https://sigtest.example",
            context="B2B workflow SaaS for logistics teams",
            profile={
                "industry": "Logistics SaaS",
                "intelligence": {
                    "founder_answers": [
                        {"index": 0, "topic": "Pricing wedge", "answer": "Mid-market expansion"}
                    ]
                },
                "_meta": {
                    "confirmed": True,
                    "interview_completed": True,
                    "signal_stack_confirmed_at": now.isoformat(),
                },
            },
        )
        session.add(company)
        session.commit()
        session.refresh(company)

        src_comp = Source(
            company_id=company.id,
            name="Competitor Changelog",
            url="https://rival.example/changelog",
            category="competitors",
            source_type="changelog",
            update_frequency="daily",
            status="approved",
            health="ok",
            reliability=0.9,
        )
        src_cust = Source(
            company_id=company.id,
            name="Customer Forum",
            url="https://forum.sigtest.example/t/1",
            category="customers",
            source_type="forum",
            update_frequency="daily",
            status="approved",
            health="ok",
            reliability=0.85,
        )
        session.add_all([src_comp, src_cust])
        session.commit()
        session.refresh(src_comp)
        session.refresh(src_cust)

        session.add(
            JobLog(
                company_id=company.id,
                job="crawl_run",
                status="completed",
                detail='{"runId": 1, "pagesFetched": 2}',
            )
        )

        rec1 = Record(
            company_id=company.id,
            source_id=src_comp.id,
            url="https://rival.example/changelog/pricing-cut",
            title="Rival cuts annual pricing by 20%",
            text="Effective December 1, Rival drops Enterprise tier by 20% for logistics teams.",
            content_hash="h1",
            published=now - timedelta(days=1),
            discovered=now - timedelta(days=1),
            total=86.0,
            scores={"relevance": 0.9, "impact": 0.85, "urgency": 0.8, "credibility": 0.9, "recency": 0.95},
            analysis={
                "title": "Rival cuts enterprise pricing by 20%",
                "summary": "Rival lowered enterprise pricing for logistics buyers starting December 1.",
                "classification": "threat",
                "relevance": 0.9,
                "impact": 0.85,
                "urgency": 0.8,
                "strategic_relevance": 0.9,
                "evidence_snippet": "Rival drops Enterprise tier by 20% for logistics teams.",
                "evidence_strength": 0.9,
                "evidence_verbatim": True,
                "why_it_matters": "Directly pressures SigTestCo's mid-market enterprise renewals.",
                "recommended_action": "Audit active renewal quotes above $25k before Dec 1.",
                "effort": "low",
                "timeframe": "This week",
                "analysed_at": (now - timedelta(days=1)).isoformat(),
            },
        )
        rec2 = Record(
            company_id=company.id,
            source_id=src_cust.id,
            url="https://forum.sigtest.example/t/erp-webhook",
            title="Customers requesting NetSuite webhook sync",
            text="Six logistics ops managers asked for native NetSuite webhook sync in Q1.",
            content_hash="h2",
            published=now - timedelta(days=2),
            discovered=now - timedelta(days=2),
            total=72.0,
            scores={"relevance": 0.8, "impact": 0.72, "urgency": 0.6, "credibility": 0.85, "recency": 0.9},
            analysis={
                "title": "Demand surge for NetSuite webhook integration",
                "summary": "Six logistics ops teams requested native NetSuite webhook support.",
                "classification": "opportunity",
                "relevance": 0.8,
                "impact": 0.72,
                "urgency": 0.6,
                "strategic_relevance": 0.85,
                "evidence_snippet": "native NetSuite webhook sync in Q1.",
                "evidence_strength": 0.8,
                "evidence_verbatim": True,
                "why_it_matters": "Unlocks mid-market expansion tier conversions.",
                "recommended_action": "Scope NetSuite webhook connector for Q1 sprint.",
                "effort": "medium",
                "timeframe": "This month",
                "analysed_at": (now - timedelta(days=2)).isoformat(),
            },
        )
        rec3_unanalysed = Record(
            company_id=company.id,
            source_id=src_cust.id,
            url="https://forum.sigtest.example/t/edi-export",
            title="EDI export thread",
            text="New unanalysed evidence waiting for analysis.",
            content_hash="h3",
            published=now,
            discovered=now,
        )
        session.add_all([rec1, rec2, rec3_unanalysed])
        session.commit()
        session.refresh(rec1)
        session.refresh(rec2)
        session.refresh(rec3_unanalysed)
        return company.id, {"threat": rec1.id, "opp": rec2.id, "pending": rec3_unanalysed.id}


def test_workflow_locks_signals_without_crawl() -> None:
    db_module.init_db()
    with db_module.SessionLocal() as session:
        c = Company(
            name="NoCrawlCo",
            website="https://nocrawl.example",
            context="Brand new company",
            profile={"_meta": {"confirmed": True, "interview_completed": True}},
        )
        session.add(c)
        session.commit()
        session.refresh(c)
        cid = c.id

    with TestClient(main.app) as client:
        res = client.get(f"/api/companies/{cid}")
        assert res.status_code == 200
        assert res.json()["workflow_status"]["signals"] == "locked"


def test_signals_overview_feed_patch_bulk_and_ask() -> None:
    cid, ids = _seed_signals_company()
    with TestClient(main.app) as client:
        # Overview
        ov = client.get(f"/api/companies/{cid}/signals/overview?range=30d")
        assert ov.status_code == 200
        data = ov.json()
        assert data["kpis"]["newSignals"] == 2
        assert data["kpis"]["opportunities"] == 1
        assert data["kpis"]["threats"] == 1
        assert data["kpis"]["evidenceCoveragePct"] == 100
        assert data["unanalysedItems"] == 1
        assert len(data["topSignals"]) == 2
        assert len(data["latestEvidence"]) >= 2

        # Feed list + filtering + evidenceById
        feed = client.get(f"/api/companies/{cid}/signals?classification=threat&minPriority=4")
        assert feed.status_code == 200
        f_json = feed.json()
        assert f_json["total"] == 1
        assert f_json["items"][0]["id"] == ids["threat"]
        assert str(ids["threat"]) in f_json["evidenceById"]

        # Single detail
        detail = client.get(f"/api/companies/{cid}/signals/{ids['threat']}")
        assert detail.status_code == 200
        assert detail.json()["signal"]["verified"] is True
        assert len(detail.json()["evidenceItems"]) == 1

        # Patch status + feedback
        patched = client.patch(
            f"/api/companies/{cid}/signals/{ids['threat']}",
            json={"status": "saved", "feedback": "useful"},
        )
        assert patched.status_code == 200
        assert patched.json()["status"] == "saved"
        assert patched.json()["feedback"] == "useful"

        # Bulk add to brief
        bulk = client.post(
            f"/api/companies/{cid}/signals/bulk",
            json={"ids": [ids["threat"], ids["opp"]], "patch": {"status": "in_brief"}},
        )
        assert bulk.status_code == 200
        assert bulk.json()["updatedCount"] == 2

        # Ask AI grounded hit vs miss
        hit = client.post(
            f"/api/companies/{cid}/signals/ask",
            json={"question": "What happened with Rival enterprise pricing?"},
        )
        assert hit.status_code == 200
        assert len(hit.json()["citations"]) >= 1

        miss = client.post(
            f"/api/companies/{cid}/signals/ask",
            json={"question": "What is the price of quantum bananas in Mars?"},
        )
        assert miss.status_code == 200
        assert miss.json()["citations"] == []
        assert miss.json()["answer"] == ""

        # Greeting returns helpful grounded guidance + suggested questions without fabricating citations
        greet = client.post(
            f"/api/companies/{cid}/signals/ask",
            json={"question": "hi"},
        )
        assert greet.status_code == 200
        greet_json = greet.json()
        assert greet_json["citations"] == []
        assert "analysed signals" in greet_json["answer"]
        assert len(greet_json["suggestedQuestions"]) >= 1


def test_signals_analyse_endpoint(monkeypatch) -> None:
    import jobs

    cid, _ = _seed_signals_company()
    monkeypatch.setattr(jobs, "start_company_job", lambda db, company_id, job: {"id": 99, "job": job, "status": "running"})
    with TestClient(main.app) as client:
        res = client.post(f"/api/companies/{cid}/signals/analyse")
        assert res.status_code == 202
        assert res.json()["job"] == "analyse"
        assert res.json()["status"] == "running"
