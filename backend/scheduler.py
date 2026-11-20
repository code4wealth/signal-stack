"""Local APScheduler for the weekly brief and monthly audit.

Disabled by default (ENABLE_SCHEDULER=1 turns it on) so `--reload` does not start
duplicate jobs. The GitHub Actions workflow is the reliable path; this is for
demoing the automation locally.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("signalstack.scheduler")

_scheduler: BackgroundScheduler | None = None


def _with_session(fn):
    import db as db_module

    def wrapper():
        db = db_module.SessionLocal()
        try:
            result = fn(db)
            logger.info("job finished: %s", str(result)[:400])
        except Exception as exc:  # logged, never swallowed silently
            logger.error("job failed: %s: %s", exc.__class__.__name__, exc)
        finally:
            db.close()

    return wrapper


def start() -> BackgroundScheduler | None:
    global _scheduler
    if os.getenv("ENABLE_SCHEDULER", "0") != "1":
        logger.info("scheduler disabled (set ENABLE_SCHEDULER=1 to run weekly/monthly jobs locally)")
        return None
    if _scheduler is not None:
        return _scheduler

    import audit

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _with_session(audit.run_weekly_all),
        CronTrigger(day_of_week="mon", hour=6, minute=0),
        id="weekly_brief",
        replace_existing=True,
    )
    _scheduler.add_job(
        _with_session(audit.run_audit_all),
        CronTrigger(day=1, hour=6, minute=30),
        id="monthly_audit",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("scheduler started at %s", datetime.utcnow().isoformat())
    return _scheduler


def shutdown() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
