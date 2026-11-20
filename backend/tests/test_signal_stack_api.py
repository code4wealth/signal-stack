from __future__ import annotations

from fastapi.testclient import TestClient

import db as db_module
import discovery
import main
from db import Company, Source


def _setup_company_with_sources() -> tuple[int, dict[str, int]]:
    db_module.init_db()
    with db_module.SessionLocal() as session:
        company = Company(
            name="TestSignalCo",
            website="https://testsignalco.example",
            context="Test company",
            profile={
                "_meta": {"interview_completed": True},
                "audit_proposals": [
                    {
                        "id": "prop-1",
                        "action": "add",
                        "source": {
                            "name": "Gartner Peer Insights",
                            "url": "https://gartner.com/reviews/example",
                            "category": "customers",
                            "type": "reviews",
                        },
                        "reasoning": "High-signal buyer reviews",
                        "evidenceIds": [],
                    }
                ],
            },
        )
        session.add(company)
        session.commit()
        session.refresh(company)

        src_cust = Source(
            company_id=company.id,
            name="Trustpilot",
            url="https://trustpilot.com/review/testsignalco.example",
            category="customers",
            source_type="webpage",
            update_frequency="daily",
            status="pending",
            relevance=0.84,
            health="ok",
            reason="Public customer reviews",
        )
        src_comp = Source(
            company_id=company.id,
            name="Rival Blog",
            url="https://rival.example/blog",
            category="competitors",
            source_type="webpage",
            update_frequency="daily",
            status="pending",
            relevance=0.82,
            health="ok",
            reason="Competitor announcements",
        )
        src_mkt = Source(
            company_id=company.id,
            name="Tech News",
            url="https://technews.example/rss",
            category="market",
            source_type="rss",
            update_frequency="daily",
            status="pending",
            relevance=0.78,
            health="ok",
            reason="Market news",
        )
        src_blocked = Source(
            company_id=company.id,
            name="Blocked Forum",
            url="https://blocked.example/forum",
            category="customers",
            source_type="webpage",
            update_frequency="weekly",
            status="pending",
            relevance=0.75,
            health="blocked",
            last_error="Disallowed by robots.txt",
            reason="Blocked by robots",
        )
        session.add_all([src_cust, src_comp, src_mkt, src_blocked])
        session.commit()
        for s in (src_cust, src_comp, src_mkt, src_blocked):
            session.refresh(s)

        return company.id, {
            "customers": src_cust.id,
            "competitors": src_comp.id,
            "market": src_mkt.id,
            "blocked": src_blocked.id,
        }


def test_signal_stack_get_patch_confirm_and_internal_files(monkeypatch) -> None:
    company_id, ids = _setup_company_with_sources()
    with TestClient(main.app) as client:
        res = client.get(f"/api/companies/{company_id}/signal-stack")
        assert res.status_code == 200
        body = res.json()
        assert body["counts"]["needs_review"] == 3
        assert body["counts"]["blocked"] == 1
        assert ".txt" in body["allowedExtensions"]
        assert ".csv" in body["allowedExtensions"]
        assert body["maxUploadBytes"] == 2 * 1024 * 1024
        assert len(body["auditProposals"]) == 1

        # Robots-disallowed source cannot be approved
        blocked_res = client.patch(
            f"/api/companies/{company_id}/sources/{ids['blocked']}",
            json={"status": "approved"},
        )
        assert blocked_res.status_code == 400
        assert "robots.txt" in blocked_res.json()["detail"].lower()

        # Confirm fails before all 3 public categories have >=1 approved source
        early_confirm = client.post(f"/api/companies/{company_id}/signal-stack/confirm")
        assert early_confirm.status_code == 400

        # Bulk approve valid sources (blocked source is skipped)
        bulk_res = client.post(
            f"/api/companies/{company_id}/sources/bulk",
            json={
                "ids": [ids["customers"], ids["competitors"], ids["market"], ids["blocked"]],
                "patch": {"status": "approved"},
            },
        )
        assert bulk_res.status_code == 200
        assert bulk_res.json()["updatedCount"] == 3

        # Frequency edit works
        freq_res = client.patch(
            f"/api/companies/{company_id}/sources/{ids['market']}",
            json={"frequency": "hourly"},
        )
        assert freq_res.status_code == 200
        assert freq_res.json()["frequency"] == "hourly"

        # Confirm now succeeds
        confirm_res = client.post(f"/api/companies/{company_id}/signal-stack/confirm")
        assert confirm_res.status_code == 200
        assert confirm_res.json()["confirmed"] is True

        # Add source validation + forceAdd
        monkeypatch.setattr(
            discovery,
            "verify_candidate",
            lambda url: (False, "timed out while fetching", url, None),
        )
        fail_add = client.post(
            f"/api/companies/{company_id}/sources",
            json={"url": "https://unreachable.example/feed", "category": "market"},
        )
        assert fail_add.status_code == 400

        force_add = client.post(
            f"/api/companies/{company_id}/sources",
            json={"url": "https://unreachable.example/feed", "category": "market", "forceAdd": True},
        )
        assert force_add.status_code == 201
        assert force_add.json()["normalized"]["domain"] == "unreachable.example"
        assert force_add.json()["normalized"]["isCustom"] is True

        # Apply monthly audit proposal
        audit_res = client.post(
            f"/api/companies/{company_id}/signal-stack/audit/apply",
            json={"decisions": [{"proposalId": "prop-1", "accepted": True}]},
        )
        assert audit_res.status_code == 200
        assert audit_res.json()["auditProposals"] == []

        # Internal file upload / list / delete
        up_res = client.post(
            f"/api/companies/{company_id}/internal/upload",
            data={"document_type": "support_tickets"},
            files={
                "file": (
                    "tickets.txt",
                    b"Customers complain about slow SSO setup and missing CSV export filters in onboarding.",
                    "text/plain",
                )
            },
        )
        assert up_res.status_code == 201
        record_id = up_res.json()["document_id"]

        list_res = client.get(f"/api/companies/{company_id}/internal/files")
        assert list_res.status_code == 200
        assert any(f["id"] == record_id for f in list_res.json()["items"])

        del_res = client.delete(f"/api/companies/{company_id}/internal/files/{record_id}")
        assert del_res.status_code == 204
