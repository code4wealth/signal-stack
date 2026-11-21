from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import automation
import db as db_module
import main


@pytest.fixture
def client():
    db_module.init_db()
    with TestClient(main.app) as c:
        yield c


def _create_company(client) -> int:
    res = client.post(
        "/api/companies",
        json={"name": "Acme Robotics", "website": "https://acme.example", "context": "Autonomous warehouse robotics"},
    )
    assert res.status_code == 201
    return res.json()["id"]


def test_automation_overview_seeds_defaults_and_calendar(client):
    cid = _create_company(client)

    res = client.get(f"/api/companies/{cid}/automation")
    assert res.status_code == 200
    body = res.json()
    assert len(body["schedules"]) == 4
    job_types = [s["jobType"] for s in body["schedules"]]
    assert job_types == ["crawl", "analysis", "weekly_brief", "source_audit"]
    assert all(len(s["nextRuns"]) >= 1 for s in body["schedules"])
    assert [n["jobType"] for n in body["pipeline"]] == ["crawl", "analysis", "weekly_brief"]
    assert body["health"]["engine"] in ("running", "stopped")
    assert len(body["health"]["successByDay"]) == 14

    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    cal = client.get(
        f"/api/companies/{cid}/automation/calendar?from={monday.isoformat()}&to={sunday.isoformat()}"
    )
    assert cal.status_code == 200
    days = cal.json()["days"]
    assert len(days) == 7
    assert any(len(d["runs"]) > 0 for d in days)


def test_schedule_preview_create_update_delete(client):
    cid = _create_company(client)

    # Valid weekly preview
    prev_ok = client.post(
        f"/api/companies/{cid}/automation/schedules/preview",
        json={
            "jobType": "weekly_brief",
            "name": "Custom brief",
            "frequency": "weekly",
            "daysOfWeek": [0, 3],
            "timeOfDay": "08:30",
            "timezone": "Asia/Kolkata",
        },
    )
    assert prev_ok.status_code == 200
    ok_data = prev_ok.json()
    assert ok_data["valid"] is True
    assert ok_data["cron"] == "30 8 * * 1,4"
    assert len(ok_data["nextRuns"]) == 5

    # Invalid custom cron
    prev_bad = client.post(
        f"/api/companies/{cid}/automation/schedules/preview",
        json={
            "jobType": "crawl",
            "name": "Bad cron",
            "frequency": "custom",
            "cron": "99 * *",
            "timezone": "UTC",
        },
    )
    assert prev_bad.status_code == 200
    assert prev_bad.json()["valid"] is False
    assert prev_bad.json()["error"]

    # Create custom schedule
    created = client.post(
        f"/api/companies/{cid}/automation/schedules",
        json={
            "jobType": "crawl",
            "name": "Midday priority crawl",
            "frequency": "daily",
            "timeOfDay": "12:30",
            "timezone": "UTC",
        },
    )
    assert created.status_code == 201
    sched_id = created.json()["id"]
    assert created.json()["isCustom"] is True

    # Update schedule
    patched = client.patch(
        f"/api/companies/{cid}/automation/schedules/{sched_id}",
        json={"enabled": False, "timeOfDay": "14:00"},
    )
    assert patched.status_code == 200
    assert patched.json()["enabled"] is False
    assert patched.json()["status"] == "paused"
    assert patched.json()["cron"] == "0 14 * * *"

    # Delete custom schedule succeeds; deleting default schedule fails
    assert client.delete(f"/api/companies/{cid}/automation/schedules/{sched_id}").status_code == 204
    overview = client.get(f"/api/companies/{cid}/automation").json()
    default_id = overview["schedules"][0]["id"]
    assert client.delete(f"/api/companies/{cid}/automation/schedules/{default_id}").status_code == 400


def test_overrides_preview_conflict_and_crud(client):
    cid = _create_company(client)
    overview = client.get(f"/api/companies/{cid}/automation").json()
    audit_sched = next(s for s in overview["schedules"] if s["jobType"] == "source_audit")
    next_audit_dt = datetime.fromisoformat(audit_sched["nextRuns"][0])
    start = (next_audit_dt - timedelta(days=1)).isoformat()
    end = (next_audit_dt + timedelta(days=1)).isoformat()

    prev = client.post(
        f"/api/companies/{cid}/automation/overrides/preview",
        json={"type": "blackout", "startsAt": start, "endsAt": end, "reason": "Company offsite"},
    )
    assert prev.status_code == 200
    p_data = prev.json()
    assert len(p_data["affectedRuns"]) >= 1
    assert any("Monthly source audit" in c for c in p_data["conflicts"])

    created = client.post(
        f"/api/companies/{cid}/automation/overrides",
        json={"type": "blackout", "startsAt": start, "endsAt": end, "reason": "Company offsite"},
    )
    assert created.status_code == 201
    ov_id = created.json()["id"]

    listed = client.get(f"/api/companies/{cid}/automation/overrides")
    assert listed.status_code == 200
    assert any(o["id"] == ov_id for o in listed.json()["items"])

    assert client.delete(f"/api/companies/{cid}/automation/overrides/{ov_id}").status_code == 204


def test_runs_dependency_skip_and_csv_export(client):
    cid = _create_company(client)
    overview = client.get(f"/api/companies/{cid}/automation").json()
    crawl_sched = next(s for s in overview["schedules"] if s["jobType"] == "crawl")
    analysis_sched = next(s for s in overview["schedules"] if s["jobType"] == "analysis")

    # Seed a failed crawl run directly to test dependency blocking and run history filtering/export
    with db_module.SessionLocal() as s:
        now = datetime.now(timezone.utc)
        failed_run = db_module.AutomationRun(
            company_id=cid,
            schedule_id=crawl_sched["id"],
            job_type="crawl",
            job_name=crawl_sched["name"],
            trigger="scheduled",
            scheduled_for=now - timedelta(minutes=10),
            started_at=now - timedelta(minutes=10),
            finished_at=now - timedelta(minutes=9),
            duration_ms=4200,
            status="failed",
            error="HTTP 502 upstream timeout",
            steps=[{"label": "Queued", "startedAt": now.isoformat(), "durationMs": 0}],
            logs=[{"id": 1, "runId": 1, "ts": now.isoformat(), "level": "error", "message": "HTTP 502 upstream timeout"}],
            scheduler_job_id=crawl_sched["schedulerJobId"],
        )
        s.add(failed_run)
        s.commit()
        s.refresh(failed_run)
        failed_run_id = failed_run.id

        # Trigger scheduled analysis run -> should record Skipped: dependency failed
        sched_obj = s.get(db_module.AutomationSchedule, analysis_sched["id"])
        skipped = automation.trigger_schedule_run(s, cid, sched_obj, trigger="scheduled", spawn=False)
        assert skipped.status == "skipped"
        assert skipped.skipped_reason == "Skipped: dependency failed"

    ov2 = client.get(f"/api/companies/{cid}/automation").json()
    analysis_node = next(n for n in ov2["pipeline"] if n["jobType"] == "analysis")
    assert analysis_node["blockedBy"] == crawl_sched["name"]

    runs_res = client.get(f"/api/companies/{cid}/automation/runs?status=failed")
    assert runs_res.status_code == 200
    assert runs_res.json()["total"] == 1
    assert runs_res.json()["items"][0]["id"] == failed_run_id

    detail_res = client.get(f"/api/companies/{cid}/automation/runs/{failed_run_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["run"]["error"] == "HTTP 502 upstream timeout"
    assert len(detail_res.json()["logs"]) == 1

    csv_res = client.get(f"/api/companies/{cid}/automation/runs/export")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "HTTP 502 upstream timeout" in csv_res.text
