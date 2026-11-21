"""APScheduler background scheduler with persistent job store and heartbeat tracking.

Disabled by default (ENABLE_SCHEDULER=1 turns it on) so `--reload` does not start
duplicate jobs. Uses SQLAlchemyJobStore when enabled, coalesce=True, max_instances=1,
and schedule-level misfire_grace_time + ZoneInfo timezones.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from apscheduler.events import EVENT_ALL
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from config import get_settings

logger = logging.getLogger("signalstack.scheduler")

_scheduler: BackgroundScheduler | None = None
_last_heartbeat_at: datetime | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _touch_heartbeat(_event=None) -> None:
    global _last_heartbeat_at
    _last_heartbeat_at = _utcnow()


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
    reason = (
        "Scheduler is disabled (ENABLE_SCHEDULER=0). Set ENABLE_SCHEDULER=1 to execute cron jobs automatically."
        if not enabled
        else "Scheduler process is not running."
    )
    return "stopped", hb, reason


def start() -> BackgroundScheduler | None:
    global _scheduler, _last_heartbeat_at
    if os.getenv("ENABLE_SCHEDULER", "0") != "1":
        logger.info("scheduler disabled (set ENABLE_SCHEDULER=1 to run scheduled jobs locally)")
        return None
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    import db as db_module

    settings = get_settings()
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
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
