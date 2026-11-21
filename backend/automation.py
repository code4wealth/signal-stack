"""Automation scheduler logic, cron evaluation, calendar, overrides, and run execution."""

from __future__ import annotations

import csv
import io
import json
import logging
import os
import threading
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.orm import Session

import db as db_module
from config import get_settings
from db import AutomationOverride, AutomationRun, AutomationSchedule, Company, JobLog, Record, Report, Source

logger = logging.getLogger("signalstack.automation")

VALID_JOB_TYPES = ("crawl", "analysis", "weekly_brief", "source_audit")
VALID_FREQUENCIES = ("hourly", "daily", "weekly", "monthly", "custom")
VALID_OVERRIDE_TYPES = ("pause", "skip", "reschedule", "run_once", "blackout")
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
# Python cron day_of_week in APScheduler CronTrigger uses mon=0..sun=6 or standard crontab sun=0..sat=6.
# Note: CronTrigger.from_crontab follows standard 5-field POSIX crontab where 0 & 7 = Sunday, 1 = Monday .. 6 = Saturday.

OPTIONS_SCHEMA_BY_TYPE: dict[str, list[dict[str, Any]]] = {
    "crawl": [
        {
            "key": "maxPagesPerRun",
            "label": "Max pages per run",
            "type": "number",
            "min": 1,
            "max": 200,
            "default": 50,
            "help": "Maximum pages fetched across approved sources per scheduled crawl.",
        }
    ],
    "analysis": [
        {
            "key": "maxAnalysesPerRun",
            "label": "Max records analysed per run",
            "type": "number",
            "min": 1,
            "max": 200,
            "default": 40,
            "help": "Caps LLM calls per run to stay within budget.",
        }
    ],
    "weekly_brief": [
        {
            "key": "includeSignalsSummary",
            "label": "Include watchlist & category deltas",
            "type": "boolean",
            "default": True,
            "help": "Include top category deltas alongside the 11 fixed brief sections.",
        }
    ],
    "source_audit": [
        {
            "key": "aggressiveness",
            "label": "Audit strictness",
            "type": "select",
            "options": ["standard", "strict"],
            "default": "standard",
            "help": "Strict marks slow or stale feeds for review earlier.",
        }
    ],
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _fmt_day_mon(dt: datetime) -> str:
    """Cross-platform '21 Nov' without GNU '%-d' (which raises ValueError on Windows)."""
    return f"{dt.day} {dt.strftime('%b')}"


def _fmt_weekday_day_mon(dt: datetime) -> str:
    """Cross-platform 'Sat 21 Nov' without GNU '%-d' (which raises ValueError on Windows)."""
    return f"{dt.strftime('%a')} {dt.day} {dt.strftime('%b')}"


def validate_timezone(tz_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, KeyError, ValueError) as exc:
        raise ValueError(f"Invalid timezone: {tz_name!r}") from exc


def build_cron_from_fields(
    frequency: str,
    *,
    cron: str | None = None,
    time_of_day: str | None = None,
    days_of_week: list[int] | None = None,
    interval_hours: int | None = None,
    day_of_month: int | str | None = None,
) -> str:
    if frequency == "custom":
        if not cron or not cron.strip():
            raise ValueError("Custom frequency requires a 5-field cron expression.")
        return cron.strip()

    hh, mm = 7, 0
    if time_of_day:
        parts = time_of_day.strip().split(":")
        if len(parts) != 2:
            raise ValueError(f"Invalid timeOfDay {time_of_day!r}; expected HH:MM")
        try:
            hh, mm = int(parts[0]), int(parts[1])
        except ValueError as exc:
            raise ValueError(f"Invalid timeOfDay {time_of_day!r}") from exc
        if not (0 <= hh <= 23 and 0 <= mm <= 59):
            raise ValueError(f"timeOfDay out of range: {time_of_day!r}")

    if frequency == "hourly":
        step = int(interval_hours or 1)
        if step not in (1, 2, 3, 4, 6, 12):
            raise ValueError("Hourly interval must be 1, 2, 3, 4, 6, or 12 hours.")
        return "0 * * * *" if step == 1 else f"0 */{step} * * *"

    if frequency == "daily":
        return f"{mm} {hh} * * *"

    if frequency == "weekly":
        # UI uses 0=Mon..6=Sun; standard crontab uses 1=Mon..6=Sat, 0=Sun
        ui_days = days_of_week if days_of_week else [0]
        cron_days = sorted({((d + 1) % 7) for d in ui_days if 0 <= d <= 6})
        if not cron_days:
            cron_days = [1]
        day_str = ",".join(str(d) for d in cron_days)
        return f"{mm} {hh} * * {day_str}"

    if frequency == "monthly":
        dom = str(day_of_month or 1).strip().lower()
        if dom == "last":
            # APScheduler CronTrigger accepts 'last' in day field, whereas standard crontab string
            # uses 28 or 'last'; store 'last' or numeric 1..28.
            return f"{mm} {hh} last * *"
        try:
            dom_num = int(dom)
        except ValueError as exc:
            raise ValueError(f"Invalid dayOfMonth {day_of_month!r}") from exc
        if not (1 <= dom_num <= 28):
            raise ValueError("dayOfMonth must be between 1 and 28 or 'last'.")
        return f"{mm} {hh} {dom_num} * *"

    raise ValueError(f"Unsupported frequency {frequency!r}")


_POSIX_DOW_TO_APS = {
    "0": "sun",
    "1": "mon",
    "2": "tue",
    "3": "wed",
    "4": "thu",
    "5": "fri",
    "6": "sat",
    "7": "sun",
}


def _posix_dow_to_apscheduler(dow_field: str) -> str:
    """Translate standard 5-field POSIX crontab day_of_week (0/7=Sun, 1=Mon..6=Sat) to APScheduler names."""
    import re as _re

    def _repl(match: _re.Match[str]) -> str:
        tok = match.group(0)
        return _POSIX_DOW_TO_APS.get(tok, tok)

    # Replace standalone integers 0..7 outside step values (after '/')
    return _re.sub(r"(?<!/)\b[0-7]\b", _repl, dow_field.strip())


def parse_cron_trigger(cron: str, tz_name: str) -> CronTrigger:
    tz = validate_timezone(tz_name)
    cleaned = cron.strip()
    parts = cleaned.split()
    if len(parts) != 5:
        raise ValueError(f"Cron expression must have exactly 5 fields (minute hour day month day_of_week); got {len(parts)}.")
    minute_f, hour_f, day_f, month_f, dow_f = parts
    try:
        # Validate standard crontab syntax first, then translate numeric POSIX weekdays
        # because APScheduler's from_crontab maps 0->Monday unless weekday names are used.
        aps_dow = "*" if dow_f == "*" else _posix_dow_to_apscheduler(dow_f)
        return CronTrigger(
            minute=minute_f,
            hour=hour_f,
            day="last" if day_f.lower() == "last" else day_f,
            month=month_f,
            day_of_week=aps_dow,
            timezone=tz,
        )
    except Exception as exc:
        raise ValueError(f"Invalid cron expression: {exc}") from exc


def compute_next_runs(
    cron: str,
    tz_name: str,
    *,
    count: int = 5,
    after: datetime | None = None,
    paused_until: datetime | None = None,
) -> list[datetime]:
    trigger = parse_cron_trigger(cron, tz_name)
    cursor = _ensure_aware(after) or utcnow()
    if paused_until is not None:
        paused_aware = _ensure_aware(paused_until)
        if paused_aware and paused_aware > cursor:
            cursor = paused_aware
    tz = validate_timezone(tz_name)
    local_cursor = cursor.astimezone(tz)
    out: list[datetime] = []
    prev: datetime | None = None
    for _ in range(count):
        nxt = trigger.get_next_fire_time(prev, local_cursor)
        if nxt is None:
            break
        out.append(nxt.astimezone(timezone.utc))
        prev = nxt
        local_cursor = nxt + timedelta(seconds=1)
    return out


def compute_runs_in_window(
    cron: str,
    tz_name: str,
    window_start: datetime,
    window_end: datetime,
    *,
    limit: int = 400,
) -> list[datetime]:
    trigger = parse_cron_trigger(cron, tz_name)
    tz = validate_timezone(tz_name)
    cursor = _ensure_aware(window_start) or utcnow()
    end_aware = _ensure_aware(window_end) or (cursor + timedelta(days=7))
    local_cursor = cursor.astimezone(tz)
    local_end = end_aware.astimezone(tz)
    out: list[datetime] = []
    prev: datetime | None = None
    for _ in range(limit):
        nxt = trigger.get_next_fire_time(prev, local_cursor)
        if nxt is None or nxt > local_end:
            break
        out.append(nxt.astimezone(timezone.utc))
        prev = nxt
        local_cursor = nxt + timedelta(seconds=1)
    return out


def describe_schedule(
    cron: str,
    tz_name: str,
    frequency: str | None = None,
    days_of_week: list[int] | None = None,
    interval_hours: int | None = None,
    day_of_month: int | str | None = None,
    time_of_day: str | None = None,
) -> tuple[str, str]:
    """Return (humanReadable, runsPerPeriodLabel) validated against CronTrigger."""
    parse_cron_trigger(cron, tz_name)
    parts = cron.strip().split()
    mm_str, hh_str, dom_str, _mon, dow_str = parts

    hhmm = time_of_day or (
        f"{int(hh_str):02d}:{int(mm_str):02d}"
        if hh_str.isdigit() and mm_str.isdigit()
        else f"{hh_str}:{mm_str}"
    )

    if frequency == "hourly" or (hh_str.startswith("*/") or hh_str == "*"):
        step = interval_hours
        if step is None:
            if hh_str == "*":
                step = 1
            elif hh_str.startswith("*/") and hh_str[2:].isdigit():
                step = int(hh_str[2:])
        if step:
            runs_day = max(1, 24 // step)
            human = "Every hour" if step == 1 else f"Every {step} hours"
            label = f"{runs_day} run{'s' if runs_day != 1 else ''} / day"
            return human, label

    if (frequency == "monthly") or (dom_str != "*" and dow_str == "*"):
        if dom_str.lower() == "last" or str(day_of_month).lower() == "last":
            return f"Last day of month at {hhmm}", "1 run / month"
        suffix = "th"
        if dom_str.isdigit():
            d = int(dom_str)
            if d in (1, 21):
                suffix = "st"
            elif d in (2, 22):
                suffix = "nd"
            elif d in (3, 23):
                suffix = "rd"
            return f"{d}{suffix} of every month at {hhmm}", "1 run / month"

    if dow_str != "*":
        if days_of_week:
            names = [WEEKDAY_NAMES[d] for d in sorted(set(days_of_week)) if 0 <= d <= 6]
        else:
            # Parse crontab dow_str (0=Sun..6=Sat, 7=Sun)
            mapping = {0: 6, 7: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5}
            idxs: list[int] = []
            for tok in dow_str.split(","):
                if tok.isdigit() and int(tok) in mapping:
                    idxs.append(mapping[int(tok)])
            names = [WEEKDAY_NAMES[i] for i in sorted(set(idxs))]
        if names:
            joined = ", ".join(names) if len(names) <= 3 else f"{len(names)} days/week"
            count = len(names)
            return f"Every {joined} at {hhmm}", f"{count} run{'s' if count != 1 else ''} / week"

    if dom_str == "*" and dow_str == "*" and hh_str.isdigit() and mm_str.isdigit():
        return f"Every day at {hhmm}", "1 run / day"

    # Generic fallback via next runs count in 7 days
    now = utcnow()
    sample = compute_runs_in_window(cron, tz_name, now, now + timedelta(days=7), limit=200)
    per_week = len(sample)
    return f"Custom cron ({cron}) at {hhmm}", f"{per_week} run{'s' if per_week != 1 else ''} / week"


def ensure_default_schedules(db: Session, company: Company) -> list[AutomationSchedule]:
    existing = list(
        db.scalars(
            select(AutomationSchedule)
            .where(AutomationSchedule.company_id == company.id)
            .order_by(AutomationSchedule.id.asc())
        ).all()
    )
    if existing:
        return existing

    defaults = [
        AutomationSchedule(
            company_id=company.id,
            job_type="crawl",
            name="Source crawl",
            enabled=True,
            frequency="daily",
            cron="30 5 * * *",
            timezone="UTC",
            days_of_week=[0, 1, 2, 3, 4, 5, 6],
            time_of_day="05:30",
            depends_on=None,
            misfire_policy="run_late",
            grace_seconds=1800,
            max_retries=1,
            retry_delay_seconds=120,
            no_overlap=True,
            options={"maxPagesPerRun": 50},
            scheduler_job_id=f"c{company.id}_crawl",
            is_custom=False,
        ),
        AutomationSchedule(
            company_id=company.id,
            job_type="analysis",
            name="Signal analysis",
            enabled=True,
            frequency="daily",
            cron="15 6 * * *",
            timezone="UTC",
            days_of_week=[0, 1, 2, 3, 4, 5, 6],
            time_of_day="06:15",
            depends_on="crawl",
            misfire_policy="run_late",
            grace_seconds=1800,
            max_retries=1,
            retry_delay_seconds=120,
            no_overlap=True,
            options={"maxAnalysesPerRun": 40},
            scheduler_job_id=f"c{company.id}_analysis",
            is_custom=False,
        ),
        AutomationSchedule(
            company_id=company.id,
            job_type="weekly_brief",
            name="Weekly Monday Brief",
            enabled=True,
            frequency="weekly",
            cron="0 7 * * 1",
            timezone="Asia/Kolkata",
            days_of_week=[0],
            time_of_day="07:00",
            depends_on="analysis",
            misfire_policy="run_late",
            grace_seconds=3600,
            max_retries=1,
            retry_delay_seconds=300,
            no_overlap=True,
            delivery={"email": False, "recipients": []},
            options={"includeSignalsSummary": True},
            scheduler_job_id=f"c{company.id}_weekly_brief",
            is_custom=False,
        ),
        AutomationSchedule(
            company_id=company.id,
            job_type="source_audit",
            name="Monthly source audit",
            enabled=True,
            frequency="monthly",
            cron="30 6 1 * *",
            timezone="UTC",
            day_of_month="1",
            time_of_day="06:30",
            depends_on=None,
            misfire_policy="run_late",
            grace_seconds=3600,
            max_retries=1,
            retry_delay_seconds=300,
            no_overlap=True,
            options={"aggressiveness": "standard"},
            scheduler_job_id=f"c{company.id}_source_audit",
            is_custom=False,
        ),
    ]
    db.add_all(defaults)
    db.commit()
    for row in defaults:
        db.refresh(row)
    return defaults


def _serialize_run_summary(run: AutomationRun) -> dict[str, Any]:
    return {
        "id": run.id,
        "scheduleId": run.schedule_id,
        "jobType": run.job_type,
        "jobName": run.job_name,
        "trigger": run.trigger,
        "scheduledFor": _ensure_aware(run.scheduled_for).isoformat(),
        "startedAt": _ensure_aware(run.started_at).isoformat() if run.started_at else None,
        "finishedAt": _ensure_aware(run.finished_at).isoformat() if run.finished_at else None,
        "durationMs": run.duration_ms,
        "status": run.status,
        "lateByMs": run.late_by_ms,
        "skippedReason": run.skipped_reason,
        "error": run.error,
        "steps": run.steps or [],
        "output": run.output,
        "schedulerJobId": run.scheduler_job_id,
    }


def serialize_schedule(
    sched: AutomationSchedule,
    latest_run: AutomationRun | None,
    *,
    last_audit_changed_sources: int | None = None,
) -> dict[str, Any]:
    now = utcnow()
    paused_until = _ensure_aware(sched.paused_until)
    is_paused_window = paused_until is not None and paused_until > now

    next_runs = (
        [
            dt.isoformat()
            for dt in compute_next_runs(
                sched.cron,
                sched.timezone,
                count=4,
                after=now,
                paused_until=paused_until if is_paused_window else None,
            )
        ]
        if sched.enabled
        else []
    )
    human, per_period = describe_schedule(
        sched.cron,
        sched.timezone,
        frequency=sched.frequency,
        days_of_week=sched.days_of_week,
        interval_hours=sched.interval_hours,
        day_of_month=sched.day_of_month,
        time_of_day=sched.time_of_day,
    )

    if latest_run and latest_run.status in ("running", "queued"):
        status = "running"
    elif not sched.enabled or is_paused_window:
        status = "paused"
    elif (latest_run and latest_run.status == "failed") or sched.last_error:
        status = "failing"
    else:
        status = "enabled"

    dom_val: int | str | None = sched.day_of_month
    if isinstance(dom_val, str) and dom_val.isdigit():
        dom_val = int(dom_val)

    return {
        "id": sched.id,
        "companyId": sched.company_id,
        "jobType": sched.job_type,
        "name": sched.name,
        "enabled": sched.enabled,
        "frequency": sched.frequency,
        "cron": sched.cron,
        "timezone": sched.timezone,
        "humanReadable": human,
        "runsPerPeriodLabel": per_period,
        "daysOfWeek": sched.days_of_week,
        "timeOfDay": sched.time_of_day,
        "intervalHours": sched.interval_hours,
        "dayOfMonth": dom_val,
        "nextRuns": next_runs,
        "dependsOn": sched.depends_on,
        "misfire": {
            "policy": sched.misfire_policy,
            "graceSeconds": sched.grace_seconds,
        },
        "retries": {
            "max": sched.max_retries,
            "delaySeconds": sched.retry_delay_seconds,
        },
        "noOverlap": sched.no_overlap,
        "delivery": sched.delivery,
        "options": sched.options or {},
        "optionsSchema": OPTIONS_SCHEMA_BY_TYPE.get(sched.job_type, []),
        "pausedUntil": paused_until.isoformat() if paused_until else None,
        "pausedSince": _ensure_aware(sched.paused_at).isoformat() if sched.paused_at else None,
        "status": status,
        "lastRun": _serialize_run_summary(latest_run) if latest_run else None,
        "lastError": sched.last_error or (latest_run.error if latest_run and latest_run.status == "failed" else None),
        "lastAuditChangedSources": last_audit_changed_sources if sched.job_type == "source_audit" else None,
        "schedulerJobId": sched.scheduler_job_id,
        "isCustom": sched.is_custom,
    }


def serialize_override(ov: AutomationOverride) -> dict[str, Any]:
    return {
        "id": ov.id,
        "scheduleId": ov.schedule_id,
        "type": ov.type,
        "startsAt": _ensure_aware(ov.starts_at).isoformat(),
        "endsAt": _ensure_aware(ov.ends_at).isoformat() if ov.ends_at else None,
        "newTime": _ensure_aware(ov.new_time).isoformat() if ov.new_time else None,
        "reason": ov.reason,
        "createdBy": ov.created_by,
    }


def _override_applies_to_run(
    ov: AutomationOverride,
    schedule_id: int,
    run_dt: datetime,
    tz: ZoneInfo,
) -> bool:
    if ov.schedule_id is not None and ov.schedule_id != schedule_id:
        return False
    ov_start = _ensure_aware(ov.starts_at)
    ov_end = _ensure_aware(ov.ends_at) or ov_start
    if ov.type == "blackout":
        local_run_d = run_dt.astimezone(tz).date()
        local_s = ov_start.astimezone(tz).date()
        local_e = ov_end.astimezone(tz).date()
        return local_s <= local_run_d <= local_e
    if ov.type == "pause":
        return ov_start <= run_dt <= ov_end
    if ov.type in ("skip", "reschedule"):
        # Match same local date or within 2 minutes of exact timestamp
        if abs((run_dt - ov_start).total_seconds()) <= 120:
            return True
        return run_dt.astimezone(tz).date() == ov_start.astimezone(tz).date()
    return False


def build_calendar(
    db: Session,
    company_id: int,
    from_date: date,
    to_date: date,
) -> list[dict[str, Any]]:
    schedules = list(
        db.scalars(
            select(AutomationSchedule).where(AutomationSchedule.company_id == company_id)
        ).all()
    )
    overrides = list(
        db.scalars(
            select(AutomationOverride).where(AutomationOverride.company_id == company_id)
        ).all()
    )
    window_start = datetime(from_date.year, from_date.month, from_date.day, tzinfo=timezone.utc) - timedelta(days=1)
    window_end = datetime(to_date.year, to_date.month, to_date.day, 23, 59, 59, tzinfo=timezone.utc) + timedelta(days=1)

    runs = list(
        db.scalars(
            select(AutomationRun).where(
                AutomationRun.company_id == company_id,
                AutomationRun.scheduled_for >= window_start,
                AutomationRun.scheduled_for <= window_end,
            )
        ).all()
    )

    now = utcnow()
    day_map: dict[str, dict[str, Any]] = {}
    cursor_d = from_date
    while cursor_d <= to_date:
        key = cursor_d.isoformat()
        day_map[key] = {"date": key, "runs": [], "overrides": [], "isOffDay": False}
        cursor_d += timedelta(days=1)

    # Index historical runs by (schedule_id, local_date) so scheduled slots merge cleanly
    recorded_keys: set[tuple[int, str]] = set()
    for r in runs:
        sched = next((s for s in schedules if s.id == r.schedule_id), None)
        tz = validate_timezone(sched.timezone if sched else "UTC")
        dt = _ensure_aware(r.scheduled_for)
        local_dt = dt.astimezone(tz)
        d_key = local_dt.date().isoformat()
        if d_key not in day_map:
            continue
        recorded_keys.add((r.schedule_id, f"{d_key}:{local_dt.strftime('%H:%M')}"))
        day_map[d_key]["runs"].append(
            {
                "scheduleId": r.schedule_id,
                "jobType": r.job_type,
                "jobName": r.job_name,
                "time": dt.isoformat(),
                "state": r.status if r.status in ("success", "failed", "skipped", "missed", "running") else "scheduled",
                "runId": str(r.id),
            }
        )

    # Project scheduled runs across the requested week
    for sched in schedules:
        if not sched.enabled:
            continue
        tz = validate_timezone(sched.timezone)
        occurrences = compute_runs_in_window(sched.cron, sched.timezone, window_start, window_end)
        for occ in occurrences:
            local_occ = occ.astimezone(tz)
            d_key = local_occ.date().isoformat()
            slot_key = f"{d_key}:{local_occ.strftime('%H:%M')}"
            if (sched.id, slot_key) in recorded_keys:
                continue

            # Check if an override suppresses or reschedules this occurrence
            suppressed_state: str | None = None
            rescheduled_to: datetime | None = None
            for ov in overrides:
                if _override_applies_to_run(ov, sched.id, occ, tz):
                    if ov.type == "skip":
                        suppressed_state = "skipped"
                    elif ov.type in ("pause", "blackout"):
                        suppressed_state = "skipped"
                    elif ov.type == "reschedule" and ov.new_time:
                        rescheduled_to = _ensure_aware(ov.new_time)
                        suppressed_state = "rescheduled"

            if rescheduled_to is not None:
                target_d = rescheduled_to.astimezone(tz).date().isoformat()
                if target_d in day_map:
                    day_map[target_d]["runs"].append(
                        {
                            "scheduleId": sched.id,
                            "jobType": sched.job_type,
                            "jobName": sched.name,
                            "time": rescheduled_to.isoformat(),
                            "state": "scheduled",
                            "runId": None,
                        }
                    )
                continue

            if d_key not in day_map:
                continue
            state = suppressed_state if suppressed_state == "skipped" else ("missed" if occ < now - timedelta(minutes=30) else "scheduled")
            day_map[d_key]["runs"].append(
                {
                    "scheduleId": sched.id,
                    "jobType": sched.job_type,
                    "jobName": sched.name,
                    "time": occ.isoformat(),
                    "state": state,
                    "runId": None,
                }
            )

    # Add run_once overrides explicitly
    for ov in overrides:
        ov_start = _ensure_aware(ov.starts_at)
        ov_end = _ensure_aware(ov.ends_at) or ov_start
        if ov.type == "run_once" and ov.schedule_id:
            sched = next((s for s in schedules if s.id == ov.schedule_id), None)
            if sched:
                tz = validate_timezone(sched.timezone)
                d_key = ov_start.astimezone(tz).date().isoformat()
                if d_key in day_map:
                    day_map[d_key]["runs"].append(
                        {
                            "scheduleId": sched.id,
                            "jobType": sched.job_type,
                            "jobName": sched.name,
                            "time": ov_start.isoformat(),
                            "state": "scheduled",
                            "runId": None,
                        }
                    )
        # Attach override to matching days
        ser_ov = serialize_override(ov)
        for d_key, day_obj in day_map.items():
            d_obj = date.fromisoformat(d_key)
            s_d = ov_start.date()
            e_d = ov_end.date()
            if s_d <= d_obj <= e_d or (ov.new_time and _ensure_aware(ov.new_time).date() == d_obj):
                day_obj["overrides"].append(ser_ov)

    out: list[dict[str, Any]] = []
    for d_key in sorted(day_map.keys()):
        entry = day_map[d_key]
        entry["runs"].sort(key=lambda r: r["time"])
        if len(entry["runs"]) == 0:
            entry["isOffDay"] = True
        out.append(entry)
    return out


def build_upcoming_changes(
    schedules: list[AutomationSchedule],
    overrides: list[AutomationOverride],
) -> list[dict[str, Any]]:
    now = utcnow()
    horizon = now + timedelta(days=30)
    changes: list[dict[str, Any]] = []
    sched_by_id = {s.id: s for s in schedules}

    for ov in overrides:
        start = _ensure_aware(ov.starts_at)
        if start < now - timedelta(days=1) or start > horizon:
            continue
        sched = sched_by_id.get(ov.schedule_id) if ov.schedule_id else None
        target_name = sched.name if sched else "All jobs"
        if ov.type == "pause":
            end_str = _fmt_day_mon(_ensure_aware(ov.ends_at)) if ov.ends_at else "until resumed"
            changes.append(
                {
                    "id": f"ov-{ov.id}",
                    "date": start.isoformat(),
                    "label": f"{target_name} paused",
                    "subLabel": f"Until {end_str}",
                    "kind": "pause",
                }
            )
        elif ov.type == "skip":
            changes.append(
                {
                    "id": f"ov-{ov.id}",
                    "date": start.isoformat(),
                    "label": f"{target_name} skipped",
                    "subLabel": ov.reason or "One-time override",
                    "kind": "skip",
                }
            )
        elif ov.type == "reschedule":
            new_dt = _ensure_aware(ov.new_time) or start
            changes.append(
                {
                    "id": f"ov-{ov.id}",
                    "date": start.isoformat(),
                    "label": f"{target_name} moved",
                    "subLabel": new_dt.strftime("%a %H:%M"),
                    "kind": "reschedule",
                }
            )
        elif ov.type == "run_once":
            changes.append(
                {
                    "id": f"ov-{ov.id}",
                    "date": start.isoformat(),
                    "label": f"{target_name} run once",
                    "subLabel": start.strftime("%H:%M UTC"),
                    "kind": "reschedule",
                }
            )
        elif ov.type == "blackout":
            end_str = _fmt_day_mon(_ensure_aware(ov.ends_at)) if ov.ends_at else _fmt_day_mon(start)
            changes.append(
                {
                    "id": f"ov-{ov.id}",
                    "date": start.isoformat(),
                    "label": "Blackout window",
                    "subLabel": f"Through {end_str}",
                    "kind": "blackout",
                }
            )

    for s in schedules:
        if s.enabled and s.job_type == "source_audit":
            nxt = compute_next_runs(s.cron, s.timezone, count=1, after=now, paused_until=s.paused_until)
            if nxt and nxt[0] <= horizon:
                changes.append(
                    {
                        "id": f"audit-{s.id}",
                        "date": nxt[0].isoformat(),
                        "label": "Source audit",
                        "subLabel": f"Due {_fmt_day_mon(nxt[0])}",
                        "kind": "audit",
                    }
                )

    changes.sort(key=lambda c: c["date"])
    return changes


def build_pipeline(
    schedules: list[AutomationSchedule],
    latest_by_sched: dict[int, AutomationRun],
) -> list[dict[str, Any]]:
    chain = ("crawl", "analysis", "weekly_brief")
    sched_by_type: dict[str, AutomationSchedule] = {}
    for s in schedules:
        if s.job_type in chain and s.job_type not in sched_by_type:
            sched_by_type[s.job_type] = s

    nodes: list[dict[str, Any]] = []
    for jt in chain:
        sched = sched_by_type.get(jt)
        if not sched:
            continue
        last_run = latest_by_sched.get(sched.id)
        nxt = (
            compute_next_runs(sched.cron, sched.timezone, count=1, paused_until=sched.paused_until)
            if sched.enabled
            else []
        )
        blocked_by: str | None = None
        if sched.depends_on:
            dep_sched = sched_by_type.get(sched.depends_on) or next(
                (x for x in schedules if x.scheduler_job_id == sched.depends_on or x.job_type == sched.depends_on),
                None,
            )
            if dep_sched:
                dep_run = latest_by_sched.get(dep_sched.id)
                if dep_run and dep_run.status == "failed":
                    blocked_by = dep_sched.name

        nodes.append(
            {
                "jobType": sched.job_type,
                "name": sched.name,
                "nextRunAt": nxt[0].isoformat() if nxt else None,
                "lastStatus": last_run.status if last_run else None,
                "blockedBy": blocked_by,
                "enabled": sched.enabled,
            }
        )
    return nodes


def build_health(
    db: Session,
    company_id: int,
    schedules: list[AutomationSchedule],
) -> dict[str, Any]:
    import scheduler as scheduler_mod

    settings = get_settings()
    engine_state, heartbeat_at, reason = scheduler_mod.get_health_status()

    db_url = settings.database_url.lower()
    job_store = "PostgreSQL" if "postgresql" in db_url else "SQLite (SQLAlchemy)"
    now = utcnow()
    since_30 = now - timedelta(days=30)
    runs_30 = list(
        db.scalars(
            select(AutomationRun).where(
                AutomationRun.company_id == company_id,
                AutomationRun.scheduled_for >= since_30,
            )
        ).all()
    )

    missed_30 = sum(1 for r in runs_30 if r.status == "missed")
    delays = [r.late_by_ms for r in runs_30 if r.late_by_ms is not None and r.late_by_ms >= 0]
    avg_delay = int(round(sum(delays) / len(delays))) if delays else 0

    success_by_day: list[dict[str, Any]] = []
    today_d = now.date()
    for offset in range(13, -1, -1):
        d = today_d - timedelta(days=offset)
        day_runs = [r for r in runs_30 if _ensure_aware(r.scheduled_for).date() == d]
        ok_cnt = sum(1 for r in day_runs if r.status == "success")
        fail_cnt = sum(1 for r in day_runs if r.status in ("failed", "missed"))
        success_by_day.append({"date": d.isoformat(), "success": ok_cnt, "failed": fail_cnt})

    primary_tz = schedules[0].timezone if schedules else "UTC"
    grace = schedules[0].grace_seconds if schedules else 1800

    return {
        "engine": engine_state,
        "lastHeartbeatAt": heartbeat_at,
        "jobStore": job_store,
        "jobsRegistered": len([s for s in schedules if s.enabled]),
        "timezone": primary_tz,
        "missedRuns30d": missed_30,
        "avgStartDelayMs": avg_delay,
        "misfireSummary": f"Late runs execute within {grace}s",
        "successByDay": success_by_day,
        "reason": reason,
    }


def build_overview(db: Session, company: Company) -> dict[str, Any]:
    schedules = ensure_default_schedules(db, company)
    overrides = list(
        db.scalars(
            select(AutomationOverride)
            .where(AutomationOverride.company_id == company.id)
            .order_by(AutomationOverride.starts_at.asc())
        ).all()
    )
    all_runs = list(
        db.scalars(
            select(AutomationRun)
            .where(AutomationRun.company_id == company.id)
            .order_by(AutomationRun.id.desc())
            .limit(200)
        ).all()
    )

    latest_by_sched: dict[int, AutomationRun] = {}
    for r in all_runs:
        if r.schedule_id not in latest_by_sched:
            latest_by_sched[r.schedule_id] = r

    # Last audit changed sources count from latest source_audit run or JobLog
    last_audit_changed: int | None = None
    audit_sched = next((s for s in schedules if s.job_type == "source_audit"), None)
    if audit_sched and audit_sched.id in latest_by_sched:
        out = latest_by_sched[audit_sched.id].output or {}
        counts = out.get("counts") if isinstance(out, dict) else None
        if isinstance(counts, dict) and "failing" in counts:
            last_audit_changed = int(counts.get("failing", 0))

    ser_schedules = [
        serialize_schedule(
            s,
            latest_by_sched.get(s.id),
            last_audit_changed_sources=last_audit_changed,
        )
        for s in schedules
    ]

    return {
        "schedules": ser_schedules,
        "upcomingChanges": build_upcoming_changes(schedules, overrides),
        "pipeline": build_pipeline(schedules, latest_by_sched),
        "health": build_health(db, company.id, schedules),
        "overrides": [serialize_override(ov) for ov in overrides],
        "capabilities": {
            "emailConfigured": bool(os.getenv("SMTP_HOST") or os.getenv("RESEND_API_KEY")),
            "customCron": True,
            "canCreateSchedule": len(schedules) < 12,
        },
    }


def _append_log(
    db: Session,
    run: AutomationRun,
    level: str,
    message: str,
    *,
    source_domain: str | None = None,
) -> None:
    logs = list(run.logs or [])
    next_id = (logs[-1]["id"] + 1) if logs else 1
    logs.append(
        {
            "id": next_id,
            "runId": run.id,
            "ts": utcnow().isoformat(),
            "level": level,
            "sourceDomain": source_domain,
            "message": message,
        }
    )
    run.logs = logs
    db.commit()


def _execute_run_worker(run_id: int) -> None:
    session = db_module.SessionLocal()
    try:
        run = session.get(AutomationRun, run_id)
        if run is None:
            return
        company = session.get(Company, run.company_id)
        sched = session.get(AutomationSchedule, run.schedule_id)
        if company is None or sched is None:
            return

        now_start = utcnow()
        run.status = "running"
        run.started_at = now_start
        sched_for = _ensure_aware(run.scheduled_for) or now_start
        run.late_by_ms = max(0, int((now_start - sched_for).total_seconds() * 1000))
        steps: list[dict[str, Any]] = [
            {"label": "Queued", "startedAt": _ensure_aware(run.created).isoformat(), "durationMs": max(0, int((now_start - _ensure_aware(run.created)).total_seconds() * 1000))},
            {"label": "Started", "startedAt": now_start.isoformat(), "durationMs": 0},
        ]
        run.steps = steps
        session.commit()
        _append_log(session, run, "info", f"Started {sched.name} ({sched.job_type}, trigger={run.trigger})")

        t0 = time.monotonic()
        output_payload: dict[str, Any] = {}

        if sched.job_type == "crawl":
            import crawler

            step_t = time.monotonic()
            _append_log(session, run, "info", "Fetching approved sources (robots.txt respected)")
            summary = crawler.crawl_company(session, company)
            step_ms = int((time.monotonic() - step_t) * 1000)
            steps.append({"label": "Fetching sources", "startedAt": now_start.isoformat(), "durationMs": step_ms})
            output_payload = {
                "type": "crawl_run",
                "id": str(summary.get("run_id") or run.id),
                "counts": {
                    "new": int(summary.get("new_records", 0)),
                    "changed": int(summary.get("updated_records", 0)),
                    "failed": len(summary.get("errors", [])) if isinstance(summary.get("errors"), list) else int(summary.get("errors", 0) or 0),
                },
            }
            _append_log(
                session,
                run,
                "success",
                f"Crawl finished: {output_payload['counts']['new']} new, {output_payload['counts']['changed']} changed",
            )

        elif sched.job_type == "analysis":
            import analysis

            step_t = time.monotonic()
            limit = int((sched.options or {}).get("maxAnalysesPerRun") or get_settings().max_analyses_per_run)
            _append_log(session, run, "info", f"Scoring pending evidence (limit={limit})")
            summary = analysis.analyse_pending(session, company, limit=limit)
            step_ms = int((time.monotonic() - step_t) * 1000)
            steps.append({"label": "Analysing records", "startedAt": now_start.isoformat(), "durationMs": step_ms})
            output_payload = {
                "type": "analysis",
                "id": str(run.id),
                "counts": {
                    "signals": int(summary.get("analysed", 0)),
                    "failed": int(summary.get("failed", 0)),
                },
            }
            _append_log(
                session,
                run,
                "success",
                f"Analysis finished: {output_payload['counts']['signals']} signals scored",
            )

        elif sched.job_type == "weekly_brief":
            import brief

            step_t = time.monotonic()
            _append_log(session, run, "info", "Generating Weekly Monday Brief across 11 sections")
            report = brief.generate(session, company)
            step_ms = int((time.monotonic() - step_t) * 1000)
            steps.append({"label": "Generating brief", "startedAt": now_start.isoformat(), "durationMs": step_ms})
            output_payload = {
                "type": "brief",
                "id": str(report.id),
                "counts": {
                    "sections": 11,
                    "signals": int((report.content or {}).get("counts", {}).get("records", 0)),
                },
            }
            _append_log(session, run, "success", f"Brief #{report.id} generated cleanly")

        elif sched.job_type == "source_audit":
            import audit

            step_t = time.monotonic()
            _append_log(session, run, "info", "Checking source reachability and health status")
            summary = audit.audit_sources(session, company)
            step_ms = int((time.monotonic() - step_t) * 1000)
            steps.append({"label": "Auditing sources", "startedAt": now_start.isoformat(), "durationMs": step_ms})
            output_payload = {
                "type": "audit",
                "id": str(run.id),
                "counts": {
                    "checked": int(summary.get("checked", 0)),
                    "keep": int(summary.get("healthy", 0)),
                    "failing": int(summary.get("failing", 0)),
                },
            }
            _append_log(
                session,
                run,
                "success",
                f"Audit finished: {output_payload['counts']['keep']} healthy, {output_payload['counts']['failing']} failing",
            )

        finished = utcnow()
        steps.append({"label": "Finished", "startedAt": finished.isoformat(), "durationMs": 0})
        run = session.get(AutomationRun, run_id)
        sched = session.get(AutomationSchedule, run.schedule_id) if run else None
        if run:
            run.status = "success"
            run.finished_at = finished
            run.duration_ms = max(1, int((time.monotonic() - t0) * 1000))
            run.steps = steps
            run.output = output_payload
        if sched:
            sched.last_error = None
            sched.updated = finished
        session.commit()
    except Exception as exc:
        logger.error("Automation run %s failed: %s", run_id, exc, exc_info=True)
        session.rollback()
        run = session.get(AutomationRun, run_id)
        sched = session.get(AutomationSchedule, run.schedule_id) if run else None
        finished = utcnow()
        err_msg = str(exc) or exc.__class__.__name__
        if run:
            run.status = "failed"
            run.finished_at = finished
            if run.started_at:
                run.duration_ms = max(1, int((finished - _ensure_aware(run.started_at)).total_seconds() * 1000))
            run.error = err_msg
            logs = list(run.logs or [])
            next_id = (logs[-1]["id"] + 1) if logs else 1
            logs.append({"id": next_id, "runId": run.id, "ts": finished.isoformat(), "level": "error", "message": err_msg})
            run.logs = logs
        if sched:
            sched.last_error = err_msg
            sched.updated = finished
        session.commit()
    finally:
        session.close()


def trigger_schedule_run(
    db: Session,
    company_id: int,
    sched: AutomationSchedule,
    *,
    trigger: str = "manual",
    spawn: bool = True,
) -> AutomationRun:
    if sched.no_overlap:
        active = db.scalar(
            select(AutomationRun)
            .where(
                AutomationRun.schedule_id == sched.id,
                AutomationRun.status.in_(("queued", "running")),
            )
            .order_by(AutomationRun.id.desc())
        )
        if active is not None:
            return active

    now = utcnow()

    # Check dependency for scheduled runs
    if trigger == "scheduled" and sched.depends_on:
        dep = db.scalar(
            select(AutomationSchedule).where(
                AutomationSchedule.company_id == company_id,
                (AutomationSchedule.job_type == sched.depends_on) | (AutomationSchedule.scheduler_job_id == sched.depends_on),
            )
        )
        if dep is not None:
            dep_last = db.scalar(
                select(AutomationRun)
                .where(AutomationRun.schedule_id == dep.id)
                .order_by(AutomationRun.id.desc())
            )
            if dep_last and dep_last.status == "failed":
                skipped = AutomationRun(
                    company_id=company_id,
                    schedule_id=sched.id,
                    job_type=sched.job_type,
                    job_name=sched.name,
                    trigger=trigger,
                    scheduled_for=now,
                    finished_at=now,
                    duration_ms=0,
                    status="skipped",
                    skipped_reason="Skipped: dependency failed",
                    steps=[{"label": "Skipped: dependency failed", "startedAt": now.isoformat(), "durationMs": 0}],
                    logs=[{"id": 1, "runId": 0, "ts": now.isoformat(), "level": "warn", "message": f"Skipped because {dep.name} failed."}],
                    scheduler_job_id=sched.scheduler_job_id,
                )
                db.add(skipped)
                db.commit()
                db.refresh(skipped)
                return skipped

    run = AutomationRun(
        company_id=company_id,
        schedule_id=sched.id,
        job_type=sched.job_type,
        job_name=sched.name,
        trigger=trigger,
        scheduled_for=now,
        status="queued",
        steps=[{"label": "Queued", "startedAt": now.isoformat(), "durationMs": 0}],
        logs=[{"id": 1, "runId": 0, "ts": now.isoformat(), "level": "info", "message": f"Queued {sched.name} ({trigger})"}],
        scheduler_job_id=sched.scheduler_job_id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    # Fix runId in initial log entry
    if run.logs:
        run.logs = [{**entry, "runId": run.id} for entry in run.logs]
        db.commit()

    if spawn:
        t = threading.Thread(
            target=_execute_run_worker,
            args=(run.id,),
            name=f"automation-run-{run.id}",
            daemon=True,
        )
        t.start()
    return run


def preview_override(
    db: Session,
    company_id: int,
    *,
    ov_type: str,
    schedule_id: int | None,
    starts_at: datetime,
    ends_at: datetime | None = None,
    new_time: datetime | None = None,
) -> dict[str, Any]:
    if ov_type not in VALID_OVERRIDE_TYPES:
        raise ValueError(f"Unsupported override type: {ov_type!r}")

    schedules = list(
        db.scalars(select(AutomationSchedule).where(AutomationSchedule.company_id == company_id)).all()
    )
    target_scheds = [s for s in schedules if schedule_id is None or s.id == schedule_id]
    if schedule_id is not None and not target_scheds:
        raise LookupError(f"Schedule {schedule_id} not found")

    s_aware = _ensure_aware(starts_at)
    e_aware = _ensure_aware(ends_at) or (s_aware + timedelta(days=1))

    affected: list[dict[str, Any]] = []
    conflicts: list[str] = []

    for sched in target_scheds:
        if not sched.enabled:
            continue
        window_s = s_aware - timedelta(hours=12)
        window_e = e_aware + timedelta(hours=12)
        occs = compute_runs_in_window(sched.cron, sched.timezone, window_s, window_e)
        tz = validate_timezone(sched.timezone)
        for occ in occs:
            match = False
            if ov_type == "blackout":
                match = s_aware.astimezone(tz).date() <= occ.astimezone(tz).date() <= e_aware.astimezone(tz).date()
            elif ov_type == "pause":
                match = s_aware <= occ <= e_aware
            elif ov_type in ("skip", "reschedule"):
                match = occ.astimezone(tz).date() == s_aware.astimezone(tz).date()
            if match:
                affected.append(
                    {
                        "scheduleId": sched.id,
                        "jobType": sched.job_type,
                        "jobName": sched.name,
                        "scheduledFor": occ.isoformat(),
                    }
                )
                if ov_type == "blackout" and sched.job_type == "source_audit":
                    conflicts.append(
                        f"Monthly source audit ({_fmt_day_mon(occ)} {occ.strftime('%H:%M %Z')}) falls inside this blackout window."
                    )

    if ov_type == "run_once" and target_scheds:
        s0 = target_scheds[0]
        summary = f"This will run {s0.name} once on {_fmt_weekday_day_mon(s_aware)} at {s_aware.strftime('%H:%M UTC')}"
    elif ov_type == "skip" and target_scheds:
        s0 = target_scheds[0]
        summary = f"This will skip {s0.name} on {_fmt_weekday_day_mon(s_aware)}"
    elif ov_type == "reschedule" and target_scheds and new_time:
        s0 = target_scheds[0]
        n_aware = _ensure_aware(new_time)
        summary = f"This will move {s0.name} on {_fmt_weekday_day_mon(s_aware)} to {_fmt_weekday_day_mon(n_aware)} at {n_aware.strftime('%H:%M UTC')}"
    elif ov_type == "pause":
        target_lbl = target_scheds[0].name if len(target_scheds) == 1 else "all active schedules"
        summary = f"This will pause {target_lbl} until {_fmt_weekday_day_mon(e_aware)}"
    else:
        summary = f"Blackout from {_fmt_day_mon(s_aware)} to {_fmt_day_mon(e_aware)} ({len(affected)} scheduled runs skipped)"

    return {
        "summary": summary,
        "affectedRuns": affected,
        "conflicts": conflicts,
    }


def export_runs_csv(runs: list[AutomationRun]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "run_id",
            "schedule_id",
            "job_type",
            "job_name",
            "trigger",
            "scheduled_for",
            "started_at",
            "finished_at",
            "duration_ms",
            "status",
            "late_by_ms",
            "error",
            "scheduler_job_id",
        ]
    )
    for r in runs:
        writer.writerow(
            [
                r.id,
                r.schedule_id,
                r.job_type,
                r.job_name,
                r.trigger,
                _ensure_aware(r.scheduled_for).isoformat(),
                _ensure_aware(r.started_at).isoformat() if r.started_at else "",
                _ensure_aware(r.finished_at).isoformat() if r.finished_at else "",
                r.duration_ms if r.duration_ms is not None else "",
                r.status,
                r.late_by_ms if r.late_by_ms is not None else "",
                r.error or r.skipped_reason or "",
                r.scheduler_job_id,
            ]
        )
    return buf.getvalue()
