"""Tests for Priority 5: Company Overview dashboard completeness endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient

import db as db_module
import main
from db import JobLog, Record, Report, Source


def test_company_overview_returns_real_counts_and_latest_runs() -> None:
    with TestClient(main.app) as client:
        company = client.post(
            "/api/companies",
            json={"name": "TEST_Dash", "website": "https://dash.test", "context": "TEST"},
        ).json()

        with db_module.SessionLocal() as db:
            s1 = Source(company_id=company["id"], name="Cust", url="https://dash.test/c", category="customers", status="approved")
            s2 = Source(company_id=company["id"], name="Comp", url="https://dash.test/k", category="competitors", status="pending")
            db.add_all([s1, s2])
            db.flush()
            r1 = Record(
                company_id=company["id"],
                source_id=s1.id,
                url="https://dash.test/c/1",
                title="Signal 1",
                text="Some analysed content",
                content_hash="9" * 64,
                total=71.0,
                analysis={"summary": "ok"},
            )
            r2 = Record(
                company_id=company["id"],
                source_id=s1.id,
                url="https://dash.test/c/2",
                title="Signal 2",
                text="Pending analysis content",
                content_hash="8" * 64,
            )
            db.add_all([r1, r2])
            db.add(JobLog(company_id=company["id"], job="crawl", status="ok", detail='{"new_records": 2}'))
            db.add(
                Report(
                    company_id=company["id"],
                    content={"generated_at": "2026-11-20T00:00:00Z", "actions": [{"action": "Do X"}]},
                    markdown="# Brief",
                )
            )
            db.commit()

        res = client.get(f"/api/companies/{company['id']}/overview")
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["sources_by_category"]["customers"]["approved"] == 1
        assert data["sources_by_category"]["competitors"]["pending"] == 1
        assert data["records_total"] == 2
        assert data["records_analysed"] == 1
        assert data["latest_crawl"]["status"] == "ok"
        assert data["latest_report"]["actions"] == 1
