"""Tests for data deduplication across companies, sources, feeds, and records."""

from __future__ import annotations

from fastapi.testclient import TestClient

import crawler
import db as db_module
import dedup
import discovery
import jobs
import main
from db import Company, QA, Record, Source
from research import canonical_url_key


def test_canonical_url_key_normalises_scheme_www_slash_and_tracking() -> None:
    a = canonical_url_key("https://www.Example.COM/blog/?utm_source=x#top")
    b = canonical_url_key("http://example.com/blog")
    assert a == b == "example.com/blog"
    assert canonical_url_key("https://example.com/post?id=42") != canonical_url_key("https://example.com/post?id=99")


def test_add_source_and_audit_apply_reject_or_merge_canonical_duplicates(monkeypatch) -> None:
    monkeypatch.setattr(
        discovery,
        "verify_candidate",
        lambda url: (True, "ok", "https://example.com/blog", None),
    )

    with TestClient(main.app) as client:
        created = client.post(
            "/api/companies",
            json={"name": "TEST_DedupCo", "website": "https://public.test", "context": "TEST"},
        )
        assert created.status_code == 201
        cid = created.json()["id"]

        first = client.post(
            f"/api/companies/{cid}/sources",
            json={"url": "https://example.com/blog", "category": "market"},
        )
        assert first.status_code == 201

        # Different scheme/www/trailing-slash/query that resolves to the same canonical source
        dup = client.post(
            f"/api/companies/{cid}/sources",
            json={"url": "http://www.example.com/blog/?utm_source=test", "category": "market"},
        )
        assert dup.status_code == 409

        # Audit proposal adding the same source updates instead of creating a duplicate
        with db_module.SessionLocal() as session:
            comp = session.get(Company, cid)
            assert comp is not None
            comp.profile = {
                "summary": "TEST",
                "audit_proposals": [
                    {
                        "id": "prop-dup",
                        "action": "add",
                        "source": {"url": "http://www.example.com/blog/", "name": "Blog", "category": "market"},
                    }
                ],
            }
            session.commit()

        applied = client.post(
            f"/api/companies/{cid}/signal-stack/audit/apply",
            json={"decisions": [{"proposalId": "prop-dup", "accepted": True}]},
        )
        assert applied.status_code == 200
        with db_module.SessionLocal() as session:
            sources = session.query(Source).filter(Source.company_id == cid).all()
            assert len(sources) == 1
            assert sources[0].status == "approved"


def test_research_entry_reuses_existing_company_on_retry(monkeypatch) -> None:
    monkeypatch.setattr(jobs, "start_company_job", lambda _db, cid, kind: {"job_id": 1, "company_id": cid, "job": kind, "status": "running"})

    with TestClient(main.app) as client:
        r1 = client.post(
            "/api/companies/research",
            json={"companyName": "TEST_RetryCo", "websiteUrl": "https://www.retry.test/"},
        )
        assert r1.status_code == 202
        r2 = client.post(
            "/api/companies/research",
            json={"companyName": "TEST_RetryCo", "websiteUrl": "http://retry.test"},
        )
        assert r2.status_code == 202
        assert r2.json()["company_id"] == r1.json()["company_id"]


def test_dedup_database_cleans_existing_duplicates_preserving_updates() -> None:
    db_module.init_db()
    with db_module.SessionLocal() as session:
        c1 = Company(name="TEST_CleanCo", website="https://clean.test", context="TEST", profile={"summary": "ok"})
        c2 = Company(name="TEST_CleanCo", website="http://www.clean.test/", context="TEST")
        session.add_all([c1, c2])
        session.commit()
        session.refresh(c1)
        session.refresh(c2)

        s1 = Source(company_id=c1.id, name="Blog", url="https://clean.test/blog", category="market", status="approved")
        s2 = Source(company_id=c1.id, name="Blog WWW", url="http://www.clean.test/blog/", category="market", status="pending")
        session.add_all([s1, s2])
        session.commit()
        session.refresh(s1)
        session.refresh(s2)

        r1 = Record(company_id=c1.id, source_id=s1.id, url="https://clean.test/p1", title="P1", text="A" * 300, content_hash="same-hash", total=70.0, analysis={"title": "P1"})
        r2 = Record(company_id=c1.id, source_id=s2.id, url="https://www.clean.test/p1", title="P1 dup", text="A" * 300, content_hash="same-hash", total=0.0)
        r_upd = Record(company_id=c1.id, source_id=s1.id, url="https://clean.test/p1", title="[UPDATED] P1", text="B" * 300, content_hash="new-hash", is_update=True, total=60.0)
        session.add_all([r1, r2, r_upd])

        qa1 = QA(company_id=c1.id, idx=0, question="Q0", answer="DEMO: real answer", is_followup=False)
        qa2 = QA(company_id=c1.id, idx=0, question="Q0", answer=None, is_followup=False)
        session.add_all([qa1, qa2])
        session.commit()

        summary = dedup.deduplicate_database(session)
        assert summary["companies_removed"] >= 1
        assert summary["sources_removed"] >= 1
        assert summary["records_removed"] >= 1
        assert summary["qa_removed"] >= 1
        assert session.query(Company).filter(Company.name == "TEST_CleanCo").count() == 1
        assert session.query(Source).filter(Source.company_id == c1.id).count() == 1
        assert session.query(Record).filter(Record.company_id == c1.id).count() == 2
        assert session.query(QA).filter(QA.company_id == c1.id).count() == 1
