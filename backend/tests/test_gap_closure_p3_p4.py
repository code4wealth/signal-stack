"""Tests for Priority 3 (Intelligence feed filters) and Priority 4 (Cross-source corroboration)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

import db as db_module
import main
from db import Record, Source


def test_intelligence_filters_and_cross_source_corroboration() -> None:
    with TestClient(main.app) as client:
        company = client.post(
            "/api/companies",
            json={"name": "TEST_Intel", "website": "https://intel.test", "context": "TEST"},
        ).json()

        now = datetime.now(timezone.utc)
        with db_module.SessionLocal() as db:
            src_a = Source(company_id=company["id"], name="Source A", url="https://a.test", category="market", status="approved")
            src_b = Source(company_id=company["id"], name="Source B", url="https://b.test", category="competitors", status="approved")
            db.add_all([src_a, src_b])
            db.flush()

            rec1 = Record(
                company_id=company["id"],
                source_id=src_a.id,
                url="https://a.test/1",
                title="UK Graduate Route Visa Extension Announced",
                text="UK Graduate Route visa extension policy announced for international applicants.",
                content_hash="1" * 64,
                discovered=now - timedelta(days=1),
                total=78.0,
                scores={"relevance": 0.9, "impact": 0.85, "explanation": "High score"},
                analysis={
                    "title": "UK Graduate Route Visa Extension Announced",
                    "summary": "UK Graduate Route visa extension policy announced for international applicants.",
                    "relevance": 0.9,
                    "impact": 0.85,
                    "evidence_verbatim": True,
                    "classification": "opportunity",
                },
            )
            rec2 = Record(
                company_id=company["id"],
                source_id=src_b.id,
                url="https://b.test/2",
                title="Competitor reacts to UK Graduate Route Visa Extension",
                text="Rival consultancy launched campaign around UK Graduate Route visa extension policy.",
                content_hash="2" * 64,
                discovered=now - timedelta(days=1),
                total=55.0,
                scores={"relevance": 0.7, "impact": 0.6, "explanation": "Medium score"},
                analysis={
                    "title": "Competitor reacts to UK Graduate Route Visa Extension",
                    "summary": "Rival consultancy launched campaign around UK Graduate Route visa extension policy.",
                    "relevance": 0.7,
                    "impact": 0.6,
                    "evidence_verbatim": True,
                    "classification": "threat",
                },
            )
            rec3 = Record(
                company_id=company["id"],
                source_id=src_a.id,
                url="https://a.test/3",
                title="Unrelated older cafeteria note",
                text="Campus cafeteria renovation schedule updated.",
                content_hash="3" * 64,
                discovered=now - timedelta(days=20),
                total=22.0,
                scores={"relevance": 0.2, "impact": 0.1, "explanation": "Low score"},
                analysis={
                    "title": "Unrelated older cafeteria note",
                    "summary": "Campus cafeteria renovation schedule updated.",
                    "relevance": 0.2,
                    "impact": 0.1,
                    "evidence_verbatim": False,
                    "classification": "neutral",
                },
            )
            db.add_all([rec1, rec2, rec3])
            db.commit()
            src_a_id, src_b_id = src_a.id, src_b.id

        # 1. Cross-source corroboration links rec1 <-> rec2 across Source A and Source B
        all_res = client.get(f"/api/companies/{company['id']}/intelligence").json()
        assert all_res["total"] == 3
        first = all_res["items"][0]
        assert first["corroborated"] is True
        assert len(first["related_records"]) == 1
        assert first["related_records"][0]["source_name"] == "Source B"

        # 2. Classification filter
        threats = client.get(f"/api/companies/{company['id']}/intelligence?classification=threat").json()
        assert threats["total"] == 1
        assert threats["items"][0]["classification"] == "threat"

        # 3. Priority band filter (high >= 70, medium 40..70, low < 40)
        high = client.get(f"/api/companies/{company['id']}/intelligence?priority_band=high").json()
        assert high["total"] == 1 and high["items"][0]["total"] >= 70
        med = client.get(f"/api/companies/{company['id']}/intelligence?priority_band=medium").json()
        assert med["total"] == 1 and 40 <= med["items"][0]["total"] < 70

        # 4. Verification + min_relevance + source_id + date_from filters
        verified = client.get(f"/api/companies/{company['id']}/intelligence?verified_only=true&source_id={src_a_id}").json()
        assert verified["total"] == 1

        recent_from = (now - timedelta(days=5)).date().isoformat()
        recent = client.get(f"/api/companies/{company['id']}/intelligence?date_from={recent_from}&min_impact=0.8").json()
        assert recent["total"] == 1
        assert recent["items"][0]["source"]["id"] == src_a_id

        # 5. Keyword search
        search = client.get(f"/api/companies/{company['id']}/intelligence?q=cafeteria").json()
        assert search["total"] == 1
        assert search["items"][0]["source"]["id"] == src_a_id
        assert src_b_id != src_a_id
