"""APScheduler background scheduler with persistent job store, heartbeat, and single-instance lock.

Disabled by default (ENABLE_SCHEDULER=1 turns it on). Protected by both an
in-process lock and a non-blocking OS file lock so only one scheduler instance
can start across processes.
"""

from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import IO
from zoneinfo import ZoneInfo

from apscheduler.events import EVENT_ALL
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from config import get_settings

logger = logging.getLogger("signalstack.scheduler")

_scheduler: BackgroundScheduler | None = None
_last_heartbeat_at: datetime | None = None
_start_lock = threading.Lock()
_lock_handle: IO[str] | None = None
_lock_conflict: bool = False


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _touch_heartbeat(_event=None) -> None:
    global _last_heartbeat_at
    _last_heartbeat_at = _utcnow()


def _acquire_process_lock(lock_path: Path) -> bool:
    """Acquire a non-blocking exclusive file lock. Returns False if another scheduler holds it."""
    global _lock_handle
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = open(lock_path, "a+", encoding="utf-8")
    try:
        if os.name == "nt":
            import msvcrt

            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return False

    handle.seek(0)
    handle.truncate()
    handle.write(f"pid={os.getpid()} started={_utcnow().isoformat()}\n")
    handle.flush()
    _lock_handle = handle
    return True


def _release_process_lock() -> None:
    global _lock_handle, _lock_conflict
    _lock_conflict = False
    handle = _lock_handle
    _lock_handle = None
    if handle is None:
        return
    try:
        if os.name == "nt":
            import msvcrt

            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    except OSError:
        pass
    finally:
        handle.close()


def _default_lock_path(database_url: str) -> Path | None:
    if database_url.startswith("sqlite:///:memory:") or database_url == "sqlite://":
        return None
    if database_url.startswith("sqlite:///"):
        db_file = Path(database_url[len("sqlite:///") :])
        return db_file.parent / ".scheduler.lock"
    return Path(__file__).resolve().parent / ".scheduler.lock"


def _run_scheduled_job(company_id: int, schedule_id: int) -> None:
    import automation
    import db as db_module

    _touch_heartbeat()
    session = db_module.SessionLocal()
    try:
        sched = session.get(db_module.AutomationSchedule, schedule_id)
        if sched is None or not sched.enabled:
            return
        now = _utcnow()
        if sched.paused_until is not None:
            paused = sched.paused_until
            if paused.tzinfo is None:
                paused = paused.replace(tzinfo=timezone.utc)
            if paused > now:
                return
        automation.trigger_schedule_run(session, company_id, sched, trigger="scheduled", spawn=False)
    except Exception as exc:
        logger.error("scheduled job %s failed: %s", schedule_id, exc, exc_info=True)
    finally:
        session.close()


def _heartbeat_tick() -> None:
    _touch_heartbeat()


def write_proof_job_log(token: str, scheduled_iso: str) -> None:
    """Target function for scripts/prove_scheduler.py (importable by SQLAlchemyJobStore)."""
    import json
    import db as db_module

    _touch_heartbeat()
    fired_at = _utcnow().isoformat()
    with db_module.SessionLocal() as session:
        session.add(
            db_module.JobLog(
                company_id=None,
                job="scheduler_proof",
                status="ok",
                detail=json.dumps(
                    {
                        "token": token,
                        "scheduled_for": scheduled_iso,
                        "fired_at": fired_at,
                    }
                ),
            )
        )
        session.commit()


def sync_schedule(sched) -> None:
    """Register or remove one AutomationSchedule in the running APScheduler."""
    if _scheduler is None or not _scheduler.running:
        return
    job_id = sched.scheduler_job_id
    if not sched.enabled:
        if _scheduler.get_job(job_id) is not None:
            _scheduler.remove_job(job_id)
        return
    import automation

    trigger = automation.parse_cron_trigger(sched.cron, sched.timezone)
    _scheduler.add_job(
        _run_scheduled_job,
        trigger=trigger,
        args=[sched.company_id, sched.id],
        id=job_id,
        replace_existing=True,
        coalesce=True,
        max_instances=1 if sched.no_overlap else 3,
        misfire_grace_time=None if sched.misfire_policy == "skip" else sched.grace_seconds,
    )


def remove_schedule_job(job_id: str) -> None:
    if _scheduler is not None and _scheduler.running and _scheduler.get_job(job_id) is not None:
        _scheduler.remove_job(job_id)


def get_health_status() -> tuple[str, str, str | None]:
    """Return (engine_state, lastHeartbeatAt_iso, reason_or_none)."""
    enabled = os.getenv("ENABLE_SCHEDULER", "0") == "1"
    if _scheduler is not None and _scheduler.running:
        hb = (_last_heartbeat_at or _utcnow()).isoformat()
        return "running", hb, None
    hb = (_last_heartbeat_at or _utcnow()).isoformat()
    if _lock_conflict:
        return "stopped", hb, "Another process already holds the scheduler lock; duplicate scheduler prevented."
    reason = (
        "Scheduler is disabled (ENABLE_SCHEDULER=0). Set ENABLE_SCHEDULER=1 to execute cron jobs automatically."
        if not enabled
        else "Scheduler process is not running."
    )
    return "stopped", hb, reason


def start(*, lock_path: Path | None = None) -> BackgroundScheduler | None:
    global _scheduler, _last_heartbeat_at, _lock_conflict
    with _start_lock:
        if os.getenv("ENABLE_SCHEDULER", "0") != "1":
            logger.info("scheduler disabled (set ENABLE_SCHEDULER=1 to run scheduled jobs locally)")
            return None
        if _scheduler is not None and _scheduler.running:
            return _scheduler

        import db as db_module

        settings = get_settings()
        resolved_lock = lock_path if lock_path is not None else _default_lock_path(settings.database_url)
        if resolved_lock is not None and not _acquire_process_lock(resolved_lock):
            _lock_conflict = True
            logger.warning(
                "Another scheduler already holds %s; refusing to start a second scheduler.",
                resolved_lock,
            )
            return None
        _lock_conflict = False

        jobstores = {}
        # SQLAlchemyJobStore cannot pickle/share an in-memory sqlite pool cleanly during tests
        if not settings.database_url.startswith("sqlite:///:memory:") and settings.database_url != "sqlite://":
            jobstores["default"] = SQLAlchemyJobStore(engine=db_module.engine)

        _scheduler = BackgroundScheduler(
            jobstores=jobstores,
            timezone=ZoneInfo("UTC"),
            job_defaults={
                "coalesce": True,
                "max_instances": 1,
                "misfire_grace_time": 1800,
            },
        )
        _scheduler.add_listener(_touch_heartbeat, EVENT_ALL)
        _scheduler.add_job(
            _heartbeat_tick,
            CronTrigger(second="*/30"),
            id="signalstack_heartbeat",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
        _scheduler.start()
        _touch_heartbeat()

        # Sync existing schedules from DB
        session = db_module.SessionLocal()
        try:
            for sched in session.query(db_module.AutomationSchedule).all():
                try:
                    sync_schedule(sched)
                except Exception as exc:
                    logger.warning("Could not sync schedule %s: %s", sched.id, exc)
        finally:
            session.close()

        logger.info("scheduler started at %s", _utcnow().isoformat())
        return _scheduler


def shutdown() -> None:
    global _scheduler
    with _start_lock:
        if _scheduler is not None:
            _scheduler.shutdown(wait=False)
            _scheduler = None
        _release_process_lock()
