"""Tests for single-scheduler guard, Monday 07:00 Asia/Kolkata schedule, monthly audit, and prove_scheduler."""

from __future__ import annotations

import importlib.util
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

import automation
import main
import scheduler

PROVE_PATH = Path(__file__).resolve().parents[2] / "scripts" / "prove_scheduler.py"


def _load_prove_module():
    spec = importlib.util.spec_from_file_location("prove_scheduler", PROVE_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_monday_0700_asia_kolkata_and_monthly_audit_seeded() -> None:
    with TestClient(main.app) as client:
        created = client.post(
            "/api/companies",
            json={"name": "TEST_ScheduleCo", "website": "https://public.test", "context": "TEST"},
        )
        assert created.status_code == 201
        cid = created.json()["id"]

        overview = client.get(f"/api/companies/{cid}/automation")
        assert overview.status_code == 200
        schedules = {s["jobType"]: s for s in overview.json()["schedules"]}

        weekly = schedules["weekly_brief"]
        assert weekly["cron"] == "0 7 * * 1"
        assert weekly["timezone"] == "Asia/Kolkata"
        assert weekly["timeOfDay"] == "07:00"
        assert weekly["daysOfWeek"] == [0]

        # Verify next run actually falls on Monday 07:00 Asia/Kolkata (01:30 UTC)
        ist = ZoneInfo("Asia/Kolkata")
        next_run = datetime.fromisoformat(weekly["nextRuns"][0]).astimezone(ist)
        assert next_run.weekday() == 0  # Monday
        assert (next_run.hour, next_run.minute) == (7, 0)

        audit = schedules["source_audit"]
        assert audit["frequency"] == "monthly"
        assert audit["cron"] == "30 6 1 * *"
        assert audit["enabled"] is True


def test_single_scheduler_guard_prevents_second_instance(tmp_path: Path, monkeypatch) -> None:
    lock_file = tmp_path / ".scheduler.lock"
    monkeypatch.setenv("ENABLE_SCHEDULER", "1")
    scheduler.shutdown()
    try:
        first = scheduler.start(lock_path=lock_file)
        assert first is not None and first.running

        # Simulate a second process trying to acquire the same lock file
        assert scheduler._acquire_process_lock(lock_file) is False

        # Re-entering start() in-process returns the existing single instance rather than spawning a second one
        second_in_proc = scheduler.start(lock_path=lock_file)
        assert second_in_proc is first
    finally:
        scheduler.shutdown()
        monkeypatch.setenv("ENABLE_SCHEDULER", "0")


def test_prove_scheduler_executes_job_and_writes_job_logs(monkeypatch) -> None:
    mod = _load_prove_module()
    scheduler.shutdown()
    try:
        row = mod.prove_scheduler(delay_seconds=1, grace_wait_seconds=10)
        assert row is not None
        assert row["job"] == "scheduler_proof"
        assert row["status"] == "ok"
    finally:
        scheduler.shutdown()
        monkeypatch.setenv("ENABLE_SCHEDULER", "0")
