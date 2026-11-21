#!/usr/bin/env python3
"""Prove APScheduler executes scheduled jobs and persists job_logs rows.

By default registers a one-off DateTrigger job 60 seconds ahead, waits for it to
fire, and prints the resulting `job_logs` row (or prints FAIL and exits 1).

Usage:
    python scripts/prove_scheduler.py
    python scripts/prove_scheduler.py --delay 60
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from apscheduler.triggers.date import DateTrigger
from sqlalchemy import select

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def prove_scheduler(*, delay_seconds: int = 60, grace_wait_seconds: int = 15) -> dict | None:
    os.environ["ENABLE_SCHEDULER"] = "1"
    import db
    import scheduler

    db.init_db()
    sched = scheduler.start()
    if sched is None or not sched.running:
        print("FAIL: scheduler did not start (check ENABLE_SCHEDULER=1 and .scheduler.lock)")
        return None

    token = uuid.uuid4().hex[:12]
    run_at = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
    job_id = f"scheduler_proof_{token}"
    try:
        sched.add_job(
            scheduler.write_proof_job_log,
            trigger=DateTrigger(run_date=run_at, timezone=timezone.utc),
            args=[token, run_at.isoformat()],
            id=job_id,
            replace_existing=True,
            misfire_grace_time=300,
        )
        print(
            f"Registered one-off APScheduler job id={job_id} scheduled for {run_at.isoformat()} "
            f"(+{delay_seconds}s). Waiting..."
        )
        deadline = time.monotonic() + delay_seconds + grace_wait_seconds
        while time.monotonic() < deadline:
            with db.SessionLocal() as session:
                rows = session.scalars(
                    select(db.JobLog)
                    .where(db.JobLog.job == "scheduler_proof")
                    .order_by(db.JobLog.id.desc())
                    .limit(10)
                ).all()
                for row in rows:
                    if token in (row.detail or ""):
                        result = {
                            "id": row.id,
                            "company_id": row.company_id,
                            "job": row.job,
                            "status": row.status,
                            "at": row.at.isoformat(),
                            "detail": row.detail,
                        }
                        print("PASS: job_logs row written by APScheduler:")
                        print(json.dumps(result, indent=2))
                        return result
            time.sleep(0.5)

        print(f"FAIL: timed out after {delay_seconds + grace_wait_seconds}s waiting for job_logs row (token={token})")
        return None
    finally:
        scheduler.shutdown()


def main() -> int:
    parser = argparse.ArgumentParser(description="Prove APScheduler executes a one-off job and writes job_logs.")
    parser.add_argument("--delay", type=int, default=60, help="Seconds ahead to schedule the proof job (default 60)")
    args = parser.parse_args()
    if args.delay < 1:
        print("FAIL: --delay must be >= 1")
        return 1
    row = prove_scheduler(delay_seconds=args.delay)
    return 0 if row is not None else 1


if __name__ == "__main__":
    raise SystemExit(main())
