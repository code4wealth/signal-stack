"""Tests for non-blocking background jobs (start, poll, failure paths) and direct CORS origins."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

import db
import llm
import main
import research


def _poll_until_done(client: TestClient, job_id: int, timeout_s: float = 5.0) -> dict:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        res = client.get(f"/api/jobs/{job_id}")
        assert res.status_code == 200
        body = res.json()
        if body["status"] in ("ok", "error"):
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish within {timeout_s}s")


def test_background_job_start_and_poll_success(monkeypatch) -> None:
    def fake_research(session, company):
        profile = {
            "summary": "TEST_profile",
            "industry": "logistics",
            "unverified": [],
            "_meta": {"pages_fetched": ["https://public.test"]},
        }
        company.profile = profile
        session.commit()
        return profile

    monkeypatch.setattr(research, "research_company", fake_research)

    with TestClient(main.app) as client:
        created = client.post(
            "/api/companies",
            json={"name": "TEST_JobCorp", "website": "https://public.test", "context": "TEST_context"},
        )
        assert created.status_code == 201
        company_id = created.json()["id"]

        started = client.post(f"/api/companies/{company_id}/jobs/research")
        assert started.status_code == 202
        start_body = started.json()
        assert start_body["status"] == "running"
        assert start_body["job"] == "research"
        job_id = start_body["job_id"]

        done = _poll_until_done(client, job_id)
        assert done["status"] == "ok"
        assert done["error"] is None
        assert done["result"]["company_id"] == company_id
        assert done["result"]["pages_fetched"] == ["https://public.test"]

        with db.SessionLocal() as session:
            row = session.get(db.JobLog, job_id)
            assert row is not None
            assert row.status == "ok"
            assert row.job == "job:research"


def test_background_job_persists_error_on_failure(monkeypatch) -> None:
    def failing_research(_session, _company):
        raise llm.LLMError("Groq request failed: APIConnectionError")

    monkeypatch.setattr(research, "research_company", failing_research)

    with TestClient(main.app) as client:
        created = client.post(
            "/api/companies",
            json={"name": "TEST_FailCorp", "website": "https://public.test", "context": "TEST_context"},
        )
        assert created.status_code == 201
        company_id = created.json()["id"]

        started = client.post(f"/api/companies/{company_id}/jobs/research")
        assert started.status_code == 202
        job_id = started.json()["job_id"]

        done = _poll_until_done(client, job_id)
        assert done["status"] == "error"
        assert done["status_code"] == 503
        assert "APIConnectionError" in done["error"]


def test_background_job_validation_and_404() -> None:
    with TestClient(main.app) as client:
        bad_company = client.post("/api/companies/999999/jobs/research")
        assert bad_company.status_code == 404

        created = client.post(
            "/api/companies",
            json={"name": "TEST_InvalidKind", "website": "https://public.test", "context": "TEST_context"},
        )
        company_id = created.json()["id"]

        bad_kind = client.post(f"/api/companies/{company_id}/jobs/not_a_job")
        assert bad_kind.status_code == 400

        missing_job = client.get("/api/jobs/999999")
        assert missing_job.status_code == 404


def test_direct_browser_cors_allows_127_and_localhost() -> None:
    with TestClient(main.app) as client:
        for origin in ("http://127.0.0.1:3000", "http://localhost:3000"):
            res = client.options(
                "/api/companies/1/jobs/research",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "POST",
                },
            )
            assert res.status_code == 200
            assert res.headers.get("access-control-allow-origin") == origin


def test_create_company_and_research_entry_endpoint(monkeypatch) -> None:
    def fake_research(session, company):
        profile = {
            "summary": "TEST_entry_profile",
            "industry": "edtech",
            "unverified": [],
            "_meta": {"pages_fetched": [company.website]},
        }
        company.profile = profile
        session.commit()
        return profile

    monkeypatch.setattr(research, "research_company", fake_research)

    with TestClient(main.app) as client:
        started = client.post(
            "/api/companies/research",
            json={"companyName": "TEST_EntryCorp", "websiteUrl": "public.test"},
        )
        assert started.status_code == 202
        body = started.json()
        assert body["status"] == "running"
        assert body["stage"] == "reading_website"
        company_id = body["company_id"]
        job_id = body["job_id"]

        done = _poll_until_done(client, job_id)
        assert done["status"] == "ok"
        assert done["stage"] == "completed"
        assert done["result"]["pages_fetched"] == ["https://public.test"]

        fetched = client.get(f"/api/companies/{company_id}")
        assert fetched.status_code == 200
        assert fetched.json()["website"] == "https://public.test"


def test_all_five_long_action_jobs_start_poll_and_fail(monkeypatch) -> None:
    import analysis
    import competitors
    import crawler
    import discovery

    monkeypatch.setattr(research, "research_company", lambda _db, _c: {"summary": "ok", "_meta": {"pages_fetched": []}})
    monkeypatch.setattr(discovery, "discover", lambda _db, c: {"company_id": c.id, "created_count": 1, "created": []})
    monkeypatch.setattr(crawler, "crawl_company", lambda _db, c: {"company_id": c.id, "new_records": 2})
    monkeypatch.setattr(analysis, "analyse_pending", lambda _db, c, limit=None: {"company_id": c.id, "analysed": 2})
    monkeypatch.setattr(competitors, "discover_competitors", lambda _db, c: {"company_id": c.id, "competitors": []})

    with TestClient(main.app) as client:
        created = client.post(
            "/api/companies",
            json={"name": "TEST_AllJobsCo", "website": "https://public.test", "context": "TEST"},
        )
        assert created.status_code == 201
        cid = created.json()["id"]

        for kind in ("research", "discover", "crawl", "analyse", "competitors"):
            started = client.post(f"/api/companies/{cid}/jobs/{kind}")
            assert started.status_code == 202, (kind, started.text)
            assert started.json()["job"] == kind
            done = _poll_until_done(client, started.json()["job_id"])
            assert done["status"] == "ok", (kind, done)

        # Now verify failure path persists real error body for discover, crawl, analyse, competitors
        def boom_discover(_db, _c):
            raise discovery.DiscoveryError("TEST discovery failed loudly")

        def boom_crawl(_db, _c):
            raise RuntimeError("TEST crawl failed loudly")

        def boom_analyse(_db, _c, limit=None):
            raise llm.LLMError("TEST analyse Groq unavailable")

        def boom_comp(_db, _c):
            raise RuntimeError("TEST competitors failed loudly")

        monkeypatch.setattr(discovery, "discover", boom_discover)
        monkeypatch.setattr(crawler, "crawl_company", boom_crawl)
        monkeypatch.setattr(analysis, "analyse_pending", boom_analyse)
        monkeypatch.setattr(competitors, "discover_competitors", boom_comp)

        expected = {
            "discover": ("TEST discovery failed loudly", 400),
            "crawl": ("TEST crawl failed loudly", 500),
            "analyse": ("TEST analyse Groq unavailable", 503),
            "competitors": ("TEST competitors failed loudly", 500),
        }
        for kind, (err_msg, status_code) in expected.items():
            started = client.post(f"/api/companies/{cid}/jobs/{kind}")
            assert started.status_code == 202
            done = _poll_until_done(client, started.json()["job_id"])
            assert done["status"] == "error", (kind, done)
            assert err_msg in done["error"]
            assert done["status_code"] == status_code

