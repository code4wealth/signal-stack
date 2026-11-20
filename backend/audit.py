"""Phase 8c - source audit and the scheduled jobs.

The audit re-fetches every active source and records its health. It never deletes
anything: sources that fail are marked `error` and reported, so a human decides.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select

import safe_fetch
from db import Company, JobLog, Source


def audit_sources(db, company) -> dict:
    sources = list(db.scalars(select(Source).where(Source.company_id == company.id)).all())
    healthy, failing, skipped = [], [], []
    for source in sources:
        if not source.url.startswith(("http://", "https://")):
            skipped.append({"source_id": source.id, "reason": "local upload, nothing to fetch"})
            continue
        try:
            result = safe_fetch.fetch(source.url)
        except safe_fetch.FetchError as exc:
            source.health = "error"
            source.last_error = exc.as_detail()
            source.last_checked = datetime.now(timezone.utc)
            failing.append({"source_id": source.id, "url": source.url, "error": source.last_error})
            continue

        source.last_checked = datetime.now(timezone.utc)
        if result.ok:
            source.health = "ok"
            source.last_ok = datetime.now(timezone.utc)
            source.last_error = None
            healthy.append({"source_id": source.id, "url": source.url, "status": result.status})
        else:
            source.health = "error"
            source.last_error = f"http {result.status}"
            failing.append({"source_id": source.id, "url": source.url, "error": source.last_error})

    db.commit()
    summary = {
        "company_id": company.id,
        "checked": len(healthy) + len(failing),
        "healthy": len(healthy),
        "failing": len(failing),
        "skipped": len(skipped),
        "failures": failing,
    }
    db.add(
        JobLog(
            company_id=company.id,
            job="source_audit",
            status="ok" if not failing else "partial",
            detail=json.dumps(summary),
        )
    )
    db.commit()
    return summary


def run_weekly(db, company) -> dict:
    """Crawl -> analyse -> brief, the same order the API uses."""
    import analysis
    import brief
    import crawler

    crawl_summary = crawler.crawl_company(db, company)
    analysis_summary = analysis.analyse_pending(db, company)
    report_id = None
    brief_error = None
    try:
        report = brief.generate(db, company)
        report_id = report.id
    except brief.BriefError as exc:
        brief_error = str(exc)

    summary = {
        "company_id": company.id,
        "crawl": {k: crawl_summary.get(k) for k in ("sources_checked", "new_records", "updated_records", "errors")},
        "analysis": {k: analysis_summary.get(k) for k in ("analysed", "failed", "evidence_flagged")},
        "report_id": report_id,
        "brief_error": brief_error,
    }
    db.add(
        JobLog(
            company_id=company.id,
            job="weekly",
            status="ok" if report_id else "partial",
            detail=json.dumps(summary),
        )
    )
    db.commit()
    return summary


def run_weekly_all(db) -> list[dict]:
    results = []
    for company in db.scalars(select(Company)).all():
        results.append(run_weekly(db, company))
    if not results:
        db.add(JobLog(company_id=None, job="weekly", status="skipped", detail="no companies to process"))
        db.commit()
    return results


def run_audit_all(db) -> list[dict]:
    results = []
    for company in db.scalars(select(Company)).all():
        results.append(audit_sources(db, company))
    if not results:
        db.add(JobLog(company_id=None, job="source_audit", status="skipped", detail="no companies to audit"))
        db.commit()
    return results
