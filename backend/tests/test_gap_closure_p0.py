"""Tests for Gap Batch 1A: config empty DATABASE_URL, profile fields/PATCH, source metadata, audit."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import audit
import config
import db as db_module
import discovery
import main
import research
from safe_fetch import FetchFailed, FetchResult
from schemas import Fact, Profile


def test_empty_database_url_env_falls_back_to_default() -> None:
    original = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = ""
    config.get_settings.cache_clear()
    try:
        s = config.get_settings()
        assert s.database_url.startswith("sqlite:///")
        assert s.database_url.endswith("signalstack.db")
    finally:
        config.get_settings.cache_clear()
        if original is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = original


def test_profile_validates_growth_opportunities_and_challenges_evidence() -> None:
    profile = Profile(
        summary="TEST summary",
        value_proposition="Faster freight invoicing",
        positioning="Built for mid-market 3PLs",
        growth_opportunities=[
            Fact(text="EU corridor expansion", evidence_url="https://alpha.test/about"),
            Fact(text="Fake expansion", evidence_url="https://invented.test/nope"),
        ],
        challenges=[
            Fact(text="Legacy EDI integrations", evidence_url="https://alpha.test/about"),
        ],
    )
    cleaned = research.validate_profile(profile, {"https://alpha.test/about"})
    assert len(cleaned.growth_opportunities) == 1
    assert cleaned.growth_opportunities[0].verified is True
    assert len(cleaned.challenges) == 1
    assert any("invented.test" in item for item in cleaned.unverified)


def test_patch_profile_updates_fields_via_api(monkeypatch) -> None:
    with TestClient(main.app) as client:
        company = client.post(
            "/api/companies",
            json={"name": "TEST_EditProfile", "website": "https://editprofile.test", "context": "TEST"},
        ).json()

        monkeypatch.setattr(
            research.safe_fetch,
            "fetch",
            lambda url, **_k: FetchResult(
                url=url,
                status=200,
                text="<html><body>" + ("Workflow platform for operators. " * 20) + "</body></html>",
                content=b"",
                content_type="text/html",
            ),
        )
        monkeypatch.setattr(
            "llm.ask",
            lambda *a, **k: Profile(
                summary="Original summary.",
                industry="logistics",
                value_proposition="Old VP",
                positioning="Old pos",
            ),
        )
        assert client.post(f"/api/companies/{company['id']}/research").status_code == 200

        patched = client.patch(
            f"/api/companies/{company['id']}/profile",
            json={
                "summary": "Edited summary.",
                "value_proposition": "Updated value proposition",
                "positioning": "Updated market positioning",
                "unverified": ["Edited hypothesis"],
            },
        )
        assert patched.status_code == 200, patched.text
        body = patched.json()
        assert body["summary"] == "Edited summary."
        assert body["value_proposition"] == "Updated value proposition"
        assert body["positioning"] == "Updated market positioning"
        assert body["unverified"] == ["Edited hypothesis"]


def test_source_metadata_fields_persisted_and_patchable(monkeypatch) -> None:
    with TestClient(main.app) as client:
        company = client.post(
            "/api/companies",
            json={"name": "TEST_SrcMeta", "website": "https://srcmeta.test", "context": "TEST"},
        ).json()
        monkeypatch.setattr(
            discovery,
            "verify_candidate",
            lambda url: (True, "http 200", "https://srcmeta.test/rss", "https://srcmeta.test/feed.xml"),
        )
        created = client.post(
            f"/api/companies/{company['id']}/sources",
            json={
                "name": "TEST Feed",
                "url": "https://srcmeta.test/rss",
                "category": "market",
                "description": "Industry RSS feed",
                "update_frequency": "daily",
            },
        )
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["source_type"] == "rss"
        assert body["description"] == "Industry RSS feed"
        assert body["update_frequency"] == "daily"

        patched = client.patch(
            f"/api/sources/{body['id']}",
            json={"update_frequency": "weekly", "description": "Updated desc"},
        )
        assert patched.status_code == 200
        assert patched.json()["update_frequency"] == "weekly"
        assert patched.json()["description"] == "Updated desc"


def test_audit_sources_and_run_weekly_log_results(monkeypatch) -> None:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    db_module.Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with Session() as session:
        company = db_module.Company(name="TEST_Audit", website="https://audit.test", context="TEST")
        session.add(company)
        session.flush()
        ok_src = db_module.Source(
            company_id=company.id, name="OK", url="https://ok.test", category="market", status="approved"
        )
        bad_src = db_module.Source(
            company_id=company.id, name="Bad", url="https://bad.test", category="market", status="approved"
        )
        session.add_all([ok_src, bad_src])
        session.commit()

        def fake_fetch(url, **_k):
            if "bad.test" in url:
                raise FetchFailed("http 500", url=url, status=500)
            return FetchResult(url=url, status=200, text="ok", content=b"ok")

        monkeypatch.setattr(audit.safe_fetch, "fetch", fake_fetch)
        audit_summary = audit.audit_sources(session, company)
        assert audit_summary["healthy"] == 1
        assert audit_summary["failing"] == 1
        session.refresh(bad_src)
        assert bad_src.health == "error"

        weekly_summary = audit.run_weekly(session, company)
        assert weekly_summary["report_id"] is None
        assert weekly_summary["brief_error"]
