from __future__ import annotations

from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

import config
import db as db_module
import llm
import main
from db import Company, JobLog, Record, Report, Source
from schemas import SignalsAskLLMOut


def _seed_dashboard_company() -> int:
    db_module.init_db()
    now = datetime.now(timezone.utc)
    with db_module.SessionLocal() as session:
        company = Company(
            name="DashCo",
            website="https://dashco.example",
            context="B2B logistics analytics",
            profile={
                "founder_first_name": "Elena",
                "_meta": {
                    "confirmed": True,
                    "interview_completed": True,
                    "signal_stack_confirmed_at": now.isoformat(),
                    "automation_enabled": True,
                },
            },
        )
        session.add(company)
        session.commit()
        session.refresh(company)

        src1 = Source(
            company_id=company.id,
            name="Rival Changelog",
            url="https://rival.example/changelog",
            category="competitors",
            source_type="changelog",
            update_frequency="daily",
            status="approved",
            health="ok",
            last_checked=now,
        )
        src2 = Source(
            company_id=company.id,
            name="Customer Forum",
            url="https://forum.dashco.example",
            category="customers",
            source_type="forum",
            update_frequency="daily",
            status="approved",
            health="failing",
            last_checked=now - timedelta(days=10),
        )
        session.add_all([src1, src2])
        session.commit()
        session.refresh(src1)
        session.refresh(src2)

        session.add(
            JobLog(
                company_id=company.id,
                job="crawl_run",
                status="completed",
                detail='{"runId": 1, "pagesFetched": 2}',
            )
        )
        session.add(
            Report(
                company_id=company.id,
                markdown="# Weekly Brief",
                content={"risks": []},
            )
        )

        rec1 = Record(
            company_id=company.id,
            source_id=src1.id,
            url="https://rival.example/changelog/discount",
            title="Rival introduces 20% annual discount",
            text="Rival launched a 20% annual tier discount for enterprise buyers.",
            content_hash="dash-h1",
            published=now - timedelta(days=1),
            discovered=now - timedelta(days=1),
            total=88.0,
            scores={"relevance": 0.9, "impact": 0.88, "urgency": 0.85, "credibility": 0.9, "recency": 0.95},
            analysis={
                "title": "Rival cuts enterprise annual pricing by 20%",
                "summary": "Rival introduced a 20% discount on annual enterprise contracts.",
                "classification": "threat",
                "relevance": 0.9,
                "impact": 0.88,
                "urgency": 0.85,
                "strategic_relevance": 0.9,
                "evidence_snippet": "Rival launched a 20% annual tier discount for enterprise buyers.",
                "evidence_strength": 0.9,
                "evidence_verbatim": True,
                "why_it_matters": "Directly affects Q4 enterprise renewals.",
                "recommended_action": "Audit pending enterprise renewals before Friday.",
                "effort": "low",
                "timeframe": "This week",
                "analysed_at": (now - timedelta(days=1)).isoformat(),
            },
        )
        rec2 = Record(
            company_id=company.id,
            source_id=src2.id,
            url="https://forum.dashco.example/t/api-keys",
            title="Self-serve API key management requested",
            text="Five enterprise admins requested scoped self-serve API keys.",
            content_hash="dash-h2",
            published=now - timedelta(days=2),
            discovered=now - timedelta(days=2),
            total=74.0,
            scores={"relevance": 0.82, "impact": 0.74, "urgency": 0.6, "credibility": 0.85, "recency": 0.9},
            analysis={
                "title": "Enterprise admins want self-serve API keys",
                "summary": "Five admins requested scoped self-serve API key rotation.",
                "classification": "opportunity",
                "relevance": 0.82,
                "impact": 0.74,
                "urgency": 0.6,
                "strategic_relevance": 0.8,
                "evidence_snippet": "Five enterprise admins requested scoped self-serve API keys.",
                "evidence_strength": 0.85,
                "evidence_verbatim": True,
                "why_it_matters": "Reduces onboarding friction and support tickets.",
                "recommended_action": "Include scoped API keys in next sprint plan.",
                "effort": "medium",
                "timeframe": "This month",
                "analysed_at": (now - timedelta(days=2)).isoformat(),
            },
        )
        session.add_all([rec1, rec2])
        session.commit()
        return company.id


def test_dashboard_and_search_endpoints(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "")
    config.get_settings.cache_clear()
    try:
        cid = _seed_dashboard_company()
        with TestClient(main.app) as client:
            res = client.get(f"/api/companies/{cid}/dashboard?range=30d")
            assert res.status_code == 200
            data = res.json()

            assert data["user"]["firstName"] == "Elena"
            assert data["workflowStatus"]["signals"] == "done"
            assert len(data["topPriorities"]) == 2
            assert len(data["recentSignals"]) == 2
            assert len(data["kpis"]) == 4
            assert len(data["heatmap"]) == 56  # 7 days * 8 buckets
            assert data["heatmapMax"] >= 1
            assert data["heatmapInsight"] is not None
            assert len(data["trend"]) == 30
            assert data["mix"] == {"opportunity": 1, "threat": 1, "neutral": 0}
            assert data["health"]["healthyPct"] == 50
            assert data["health"]["failing"] == 1
            assert data["health"]["stale"] == 1
            assert len(data["sourcePerformance"]) == 2
            assert data["brief"]["latestBriefId"] is not None
            assert len(data["jobs"]) == 2

            # Category filtering narrows results
            cat_res = client.get(f"/api/companies/{cid}/dashboard?range=30d&category=competitors")
            assert cat_res.status_code == 200
            cat_data = cat_res.json()
            assert cat_data["mix"] == {"opportunity": 0, "threat": 1, "neutral": 0}
            assert len(cat_data["sourcePerformance"]) == 1

            # Search endpoint
            search_res = client.get(f"/api/companies/{cid}/search?q=Rival")
            assert search_res.status_code == 200
            s_data = search_res.json()
            assert len(s_data["signals"]) == 1
            assert len(s_data["sources"]) == 1

            # Ask AI answerCard + recommendation
            ask_res = client.post(
                f"/api/companies/{cid}/signals/ask",
                json={"question": "What happened with Rival pricing?"},
            )
            assert ask_res.status_code == 200
            ask_json = ask_res.json()
            assert len(ask_json["citations"]) >= 1
            assert ask_json["answerCard"] is not None
            assert len(ask_json["answerCard"]["rows"]) >= 1
    finally:
        config.get_settings.cache_clear()


def test_ask_signals_synthesizes_answer_card_when_llm_omits_it(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    config.get_settings.cache_clear()
    try:
        cid = _seed_dashboard_company()
        with db_module.SessionLocal() as session:
            rec = session.query(Record).filter(Record.company_id == cid).order_by(Record.total.desc()).first()
            assert rec is not None
            rec_id = rec.id

        monkeypatch.setattr(
            llm,
            "ask",
            lambda *_args, **_kwargs: SignalsAskLLMOut(
                answer="Rival introduced a 20% annual discount.",
                cited_record_ids=[rec_id],
                suggested_questions=["Which enterprise renewals are affected?"],
                answer_card=None,
                recommendation=None,
            ),
        )

        with TestClient(main.app) as client:
            ask_res = client.post(
                f"/api/companies/{cid}/signals/ask",
                json={"question": "What happened with Rival pricing?"},
            )
            assert ask_res.status_code == 200
            ask_json = ask_res.json()
            assert ask_json["answer"] == "Rival introduced a 20% annual discount."
            assert len(ask_json["citations"]) == 1
            assert ask_json["answerCard"] is not None
            assert len(ask_json["answerCard"]["rows"]) == 1
            assert ask_json["recommendation"] is not None
    finally:
        config.get_settings.cache_clear()
