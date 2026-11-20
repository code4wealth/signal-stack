"""Tests for enriched company profile detail, inline PATCH fields, and POST /confirm."""

from __future__ import annotations

from fastapi.testclient import TestClient

import db
import main


def test_company_detail_patch_and_confirm_profile() -> None:
    with TestClient(main.app) as client:
        created = client.post(
            "/api/companies",
            json={
                "name": "TEST_ProfileCorp",
                "website": "https://public.test",
                "context": "TEST_context",
            },
        )
        assert created.status_code == 201
        company_id = created.json()["id"]

        # Confirm before profile exists -> 400
        pre_confirm = client.post(f"/api/companies/{company_id}/confirm")
        assert pre_confirm.status_code == 400

        # Seed a stored profile via PATCH
        patched = client.patch(
            f"/api/companies/{company_id}",
            json={
                "summary": "TEST_summary updated by founder",
                "industry": "Developer tools",
                "headquarters": "Bengaluru, India",
                "founded": "2021",
                "company_size": "51-200",
                "primary_region": "India & APAC",
                "primary_language": "English",
                "products": [
                    {
                        "text": "API Gateway: Unified payment routing",
                        "evidence_url": "https://public.test/products",
                        "verified": True,
                    }
                ],
                "competitor_decisions": {"https://other.test": "keep"},
            },
        )
        assert patched.status_code == 200
        body = patched.json()
        assert body["research_status"] == "ready"
        assert body["workflow_status"]["company"] == "current"
        assert body["profile"]["headquarters"] == "Bengaluru, India"
        assert body["profile"]["competitor_decisions"] == {"https://other.test": "keep"}

        # Confirm profile -> marks company step done
        confirmed = client.post(f"/api/companies/{company_id}/confirm")
        assert confirmed.status_code == 200
        c_body = confirmed.json()
        assert c_body["confirmed"] is True
        assert c_body["workflow_status"]["company"] == "done"
        assert c_body["workflow_status"]["interview"] == "current"

        # Verify persisted via GET
        fetched = client.get(f"/api/companies/{company_id}")
        assert fetched.status_code == 200
        f_body = fetched.json()
        assert f_body["workflow_status"]["company"] == "done"
        assert any(row["job"] == "profile_confirm" for row in f_body["research_logs"])

        with db.SessionLocal() as session:
            comp = session.get(db.Company, company_id)
            assert comp is not None
            assert comp.profile["_meta"]["confirmed_at"] == c_body["confirmed_at"]
