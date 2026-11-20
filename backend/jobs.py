"""Non-blocking background job runner backed by SQLite JobLog rows.

Long-running pipeline steps (research, source discovery, crawl, analysis,
competitor discovery) can exceed dev-proxy socket timeouts when run inline.
Each job persists its lifecycle ('running' -> 'ok' | 'error') and structured
JSON payload in JobLog so clients can poll GET /api/jobs/{job_id}.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

import db
from llm import LLMError
from safe_fetch import FetchError

logger = logging.getLogger("signalstack.jobs")

VALID_JOB_KINDS = ("research", "discover", "crawl", "analyse", "competitors")


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _execute_kind(session: Session, company: db.Company, kind: str, limit: int | None = None) -> dict[str, Any]:
    if kind == "research":
        import research

        profile = research.research_company(session, company)
        return {
            "company_id": company.id,
            "profile": profile,
            "pages_fetched": profile.get("_meta", {}).get("pages_fetched", []),
            "unverified_count": len(profile.get("unverified", [])),
        }
    if kind == "discover":
        import discovery

        return discovery.discover(session, company)
    if kind == "crawl":
        import crawler

        return crawler.crawl_company(session, company)
    if kind == "analyse":
        import analysis

        return analysis.analyse_pending(session, company, limit=limit)
    if kind == "competitors":
        import competitors

        return competitors.discover_competitors(session, company)
    raise ValueError(f"unsupported job kind: {kind}")


def _error_status_code(exc: Exception) -> int:
    import discovery
    import research

    if isinstance(exc, LLMError):
        return 503
    if isinstance(exc, FetchError):
        return 502 if exc.kind == "fetch" else 400
    if isinstance(exc, research.ResearchError):
        return 502
    if isinstance(exc, discovery.DiscoveryError):
        return 400
    if isinstance(exc, ValueError):
        return 400
    return 500


def _run_job_worker(job_id: int, company_id: int, kind: str, limit: int | None) -> None:
    session = db.SessionLocal()
    try:
        row = session.get(db.JobLog, job_id)
        company = session.get(db.Company, company_id)
        if row is None or company is None:
            return
        result = _execute_kind(session, company, kind, limit=limit)
        row = session.get(db.JobLog, job_id)
        if row is None:
            return
        row.status = "ok"
        row.detail = json.dumps(
            {
                "job": kind,
                "company_id": company_id,
                "finished_at": _utcnow_iso(),
                "result": result,
            }
        )
        session.commit()
    except Exception as exc:
        logger.error("Background job %s (%s) failed: %s", job_id, kind, exc, exc_info=True)
        session.rollback()
        row = session.get(db.JobLog, job_id)
        if row is not None:
            row.status = "error"
            row.detail = json.dumps(
                {
                    "job": kind,
                    "company_id": company_id,
                    "finished_at": _utcnow_iso(),
                    "error": str(exc) or exc.__class__.__name__,
                    "error_type": exc.__class__.__name__,
                    "status_code": _error_status_code(exc),
                }
            )
            session.commit()
    finally:
        session.close()


def start_company_job(
    session: Session,
    company_id: int,
    kind: str,
    *,
    limit: int | None = None,
    spawn: bool = True,
) -> dict[str, Any]:
    if kind not in VALID_JOB_KINDS:
        raise ValueError(f"invalid job kind {kind!r}; expected one of {', '.join(VALID_JOB_KINDS)}")
    company = session.get(db.Company, company_id)
    if company is None:
        raise LookupError(f"company {company_id} not found")

    row = db.JobLog(
        company_id=company_id,
        job=f"job:{kind}",
        status="running",
        detail=json.dumps(
            {
                "job": kind,
                "company_id": company_id,
                "started_at": _utcnow_iso(),
                "stage": "running",
            }
        ),
    )
    session.add(row)
    session.commit()
    session.refresh(row)

    if spawn:
        thread = threading.Thread(
            target=_run_job_worker,
            args=(row.id, company_id, kind, limit),
            name=f"signalstack-job-{row.id}-{kind}",
            daemon=True,
        )
        thread.start()

    return {
        "job_id": row.id,
        "company_id": company_id,
        "job": kind,
        "status": row.status,
        "stage": "reading_website" if kind == "research" else "running",
        "at": row.at.isoformat(),
    }


def get_job_status(session: Session, job_id: int) -> dict[str, Any]:
    row = session.get(db.JobLog, job_id)
    if row is None or not row.job.startswith("job:"):
        raise LookupError(f"job {job_id} not found")

    kind = row.job.split(":", 1)[1]
    parsed: dict[str, Any] = {}
    try:
        parsed = json.loads(row.detail) if row.detail else {}
    except json.JSONDecodeError:
        parsed = {}

    default_stage = (
        "completed"
        if row.status == "ok"
        else "error"
        if row.status == "error"
        else ("reading_website" if kind == "research" else "running")
    )

    return {
        "job_id": row.id,
        "company_id": row.company_id,
        "job": kind,
        "status": row.status,
        "stage": parsed.get("stage") or default_stage,
        "at": row.at.isoformat(),
        "started_at": parsed.get("started_at"),
        "finished_at": parsed.get("finished_at"),
        "result": parsed.get("result"),
        "error": parsed.get("error"),
        "error_type": parsed.get("error_type"),
        "status_code": parsed.get("status_code"),
    }
