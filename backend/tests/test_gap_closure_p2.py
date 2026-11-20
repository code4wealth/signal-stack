"""Tests for Priority 2: Competitors view/research, crawl errors, duplicates diagnostics, source history."""

from __future__ import annotations

from fastapi.testclient import TestClient

import competitors
import crawler
import db as db_module
import main
from db import Company, Record, Source
from safe_fetch import FetchFailed, FetchResult
from schemas import CompetitorCandidate, CompetitorCandidateList, CompetitorProfile, CompetitorProfileBatch


def test_discover_competitors_verifies_fetches_and_persists(monkeypatch) -> None:
    with TestClient(main.app) as client:
        company = client.post(
            "/api/companies",
            json={"name": "TEST_CompCo", "website": "https://compco.test", "context": "TEST"},
        ).json()

        call_count = {"n": 0}

        def fake_ask(prompt, schema, **_k):
            call_count["n"] += 1
            if schema is CompetitorCandidateList:
                return CompetitorCandidateList(
                    competitors=[
                        CompetitorCandidate(name="Rival A", website="https://rivala.test", rationale="Direct overlap"),
                        CompetitorCandidate(name="Dead Rival", website="https://dead.test", rationale="Dead site"),
                    ]
                )
            return CompetitorProfileBatch(
                profiles=[
                    CompetitorProfile(
                        name="Rival A",
                        website="https://rivala.test",
                        positioning="Enterprise focus",
                        pricing_or_offer="Custom annual contracts",
                        strengths=["Broad integrations"],
                        weaknesses=["Slow onboarding"],
                        differentiation="Legacy compliance tools",
                        evidence_url="https://rivala.test",
                    ),
                    CompetitorProfile(
                        name="Hallucinated Rival",
                        website="https://fake.test",
                        positioning="Fake",
                        evidence_url="https://fake.test",
                    ),
                ]
            )

        def fake_fetch(url, **_k):
            if "dead.test" in url:
                raise FetchFailed("timeout", url=url)
            return FetchResult(
                url="https://rivala.test",
                status=200,
                text="<html><body>" + ("Rival A enterprise workflows and compliance. " * 10) + "</body></html>",
                content=b"",
                content_type="text/html",
            )

        monkeypatch.setattr("llm.ask", fake_ask)
        monkeypatch.setattr(competitors.safe_fetch, "fetch", fake_fetch)

        res = client.post(f"/api/companies/{company['id']}/competitors/discover")
        assert res.status_code == 200, res.text
        data = res.json()
        assert len(data["competitors"]) == 1
        assert data["competitors"][0]["name"] == "Rival A"
        assert data["competitors"][0]["evidence_url"] == "https://rivala.test"
        assert len(data["failed"]) == 1

        got = client.get(f"/api/companies/{company['id']}/competitors")
        assert got.status_code == 200
        assert len(got.json()["competitors"]) == 1


def test_crawl_diagnostics_exposes_errors_duplicates_and_history(monkeypatch) -> None:
    with TestClient(main.app) as client:
        company = client.post(
            "/api/companies",
            json={"name": "TEST_Diag", "website": "https://diag.test", "context": "TEST"},
        ).json()

        with db_module.SessionLocal() as db:
            ok_src = Source(
                company_id=company["id"], name="OKFeed", url="https://diag.test/ok", category="market", status="approved"
            )
            bad_src = Source(
                company_id=company["id"], name="BadFeed", url="https://diag.test/bad", category="market", status="approved"
            )
            db.add_all([ok_src, bad_src])
            db.commit()

        def fake_fetch(url, **_k):
            if "bad" in url:
                raise FetchFailed("http 502", url=url, status=502)
            return FetchResult(
                url=url,
                status=200,
                text="<html><head><title>Update</title></head><body>" + ("Signal update content. " * 20) + "</body></html>",
                content=b"",
                content_type="text/html",
            )

        monkeypatch.setattr(crawler.safe_fetch, "fetch", fake_fetch)

        first = client.post(f"/api/companies/{company['id']}/crawl")
        assert first.status_code == 200
        assert first.json()["new_records"] == 1
        assert first.json()["errors"] == 1

        second = client.post(f"/api/companies/{company['id']}/crawl")
        assert second.status_code == 200
        assert second.json()["duplicates"] == 1

        diag = client.get(f"/api/companies/{company['id']}/crawl-diagnostics")
        assert diag.status_code == 200, diag.text
        body = diag.json()
        assert len(body["failing_sources"]) == 1
        assert body["failing_sources"][0]["name"] == "BadFeed"
        assert body["total_duplicates_logged"] >= 1
        assert len(body["duplicate_entries"]) >= 1
        assert len(body["history"]) >= 2
