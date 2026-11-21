"""HTTP routes. Every route here is exercised by the UI; no placeholder endpoints."""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import interview
import research
from db import (
    AutomationOverride,
    AutomationRun,
    AutomationSchedule,
    Company,
    JobLog,
    QA,
    Record,
    Report,
    Source,
    get_db,
)
from schemas import (
    AuditApplyIn,
    BriefActionCreateIn,
    BriefActionPatchIn,
    BriefFeedbackIn,
    BriefPatchIn,
    CompanyCreate,
    CompanyOut,
    CompanySettingsPatchIn,
    CompanyUpdate,
    CrawlRunStartIn,
    CrawlerSettingsPatchIn,
    OverrideDraftIn,
    ProfilePatch,
    ScheduleDraftIn,
    SchedulePatchIn,
    SignalPatchIn,
    SignalsAskIn,
    SignalsAskLLMOut,
    SignalsBulkIn,
    SourceBulkPatch,
    SourceCreate,
    SourcePatch,
)

router = APIRouter(prefix="/api")


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def get_company_or_404(db: Session, company_id: int) -> Company:
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail=f"company {company_id} not found")
    return company


class CompanyResearchIn(BaseModel):
    companyName: str = Field(min_length=2, max_length=200)
    websiteUrl: str = Field(min_length=3, max_length=500)
    context: str = Field(default="", max_length=4000)


class AnswerIn(BaseModel):
    idx: int | None = Field(default=None, ge=0)
    turnIndex: int | None = Field(default=None, ge=0)
    answer: str | None = None
    text: str | None = None
    skip: bool = False
    quotedText: str | None = None


class SkipIn(BaseModel):
    turnIndex: int | None = Field(default=None, ge=0)
    idx: int | None = Field(default=None, ge=0)


class AnswerEdit(BaseModel):
    answer: str | None = Field(default=None, min_length=1, max_length=8000)
    text: str | None = Field(default=None, min_length=1, max_length=8000)


class ActionToggle(BaseModel):
    done: bool


class ContextIn(BaseModel):
    context: str = Field(min_length=3, max_length=4000)
    run_discovery: bool = True


def _company_out(company: Company) -> CompanyOut:
    return CompanyOut(
        id=company.id,
        name=company.name,
        website=company.website,
        context=company.context or "",
        created=company.created,
        has_profile=bool(company.profile),
    )


def _validate_http_url(url: str, field: str = "website") -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status_code=400, detail=f"{field} must be an http(s) URL with a host")
    if "." not in parsed.hostname:
        raise HTTPException(status_code=400, detail=f"{field} host {parsed.hostname!r} is not a domain")
    return url


# --------------------------------------------------------------------------- #
# Companies
# --------------------------------------------------------------------------- #
@router.post("/companies", status_code=201, response_model=CompanyOut, tags=["companies"])
def create_company(payload: CompanyCreate, db: Session = Depends(get_db)) -> CompanyOut:
    website = _validate_http_url(payload.website)
    company = Company(name=payload.name, website=website, context=payload.context)
    db.add(company)
    db.commit()
    db.refresh(company)
    return _company_out(company)


@router.post("/companies/research", status_code=202, tags=["companies", "research", "jobs"])
def create_company_and_start_research(payload: CompanyResearchIn, db: Session = Depends(get_db)) -> dict:
    import jobs
    from research import canonical_url_key

    raw_url = payload.websiteUrl.strip()
    if not raw_url.lower().startswith(("http://", "https://")):
        raw_url = f"https://{raw_url}"
    website = _validate_http_url(raw_url, field="websiteUrl")
    clean_name = payload.companyName.strip()
    clean_context = payload.context.strip()
    target_key = canonical_url_key(website)

    existing = next(
        (
            c
            for c in db.scalars(select(Company).order_by(Company.id.asc())).all()
            if (c.name or "").strip().lower() == clean_name.lower()
            and canonical_url_key(c.website) == target_key
        ),
        None,
    )
    if existing is not None:
        if clean_context and not existing.context:
            existing.context = clean_context
            db.commit()
        return jobs.start_company_job(db, existing.id, "research")

    company = Company(
        name=clean_name,
        website=website,
        context=clean_context,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return jobs.start_company_job(db, company.id, "research")


@router.get("/companies", tags=["companies"])
def list_companies(
    q: str | None = Query(default=None, description="Optional case-insensitive filter across company name, website, context, or industry"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    needle = (q or "").strip().lower()
    if needle:
        all_rows = db.scalars(select(Company).order_by(Company.id)).all()
        matched = [
            c
            for c in all_rows
            if needle in (c.name or "").lower()
            or needle in (c.website or "").lower()
            or needle in (c.context or "").lower()
            or needle in str(((c.profile or {}).get("industry")) or "").lower()
        ]
        total = len(matched)
        rows = matched[offset : offset + limit]
    else:
        total = db.scalar(select(func.count()).select_from(Company)) or 0
        rows = db.scalars(select(Company).order_by(Company.id).limit(limit).offset(offset)).all()
    return {
        "items": [_company_out(company).model_dump(mode="json") for company in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def _compute_workflow_status(db: Session, company: Company) -> dict:
    profile = company.profile or {}
    meta = profile.get("_meta") or {}
    has_profile = bool(company.profile)
    confirmed = bool(meta.get("confirmed_at"))
    interview_done = bool((profile.get("intelligence") or {}).get("completed_at"))
    qa_count = db.scalar(select(func.count(QA.id)).where(QA.company_id == company.id)) or 0
    approved_sources = (
        db.scalar(
            select(func.count(Source.id)).where(
                Source.company_id == company.id, Source.status == "approved"
            )
        )
        or 0
    )
    total_sources = (
        db.scalar(select(func.count(Source.id)).where(Source.company_id == company.id)) or 0
    )
    analysed_records = (
        db.scalar(
            select(func.count(Record.id)).where(
                Record.company_id == company.id, Record.analysis.is_not(None)
            )
        )
        or 0
    )
    reports_count = (
        db.scalar(select(func.count(Report.id)).where(Report.company_id == company.id)) or 0
    )
    crawl_runs_done = (
        db.scalar(
            select(func.count(JobLog.id)).where(
                JobLog.company_id == company.id,
                JobLog.job == "crawl_run",
                JobLog.status.in_(["completed", "partial"]),
            )
        )
        or 0
    )
    crawled_records_count = (
        db.scalar(select(func.count(Record.id)).where(Record.company_id == company.id)) or 0
    )
    signal_stack_confirmed = bool(meta.get("signal_stack_confirmed_at")) or crawl_runs_done > 0

    return {
        "company": "done" if confirmed else "current",
        "interview": "done"
        if interview_done
        else ("current" if (confirmed or has_profile or qa_count > 0) else "locked"),
        "sources": "done"
        if signal_stack_confirmed
        else ("current" if (interview_done or total_sources > 0) else "locked"),
        "crawler": "done"
        if crawl_runs_done > 0
        else ("current" if signal_stack_confirmed else "locked"),
        "signals": "done"
        if analysed_records > 0
        else ("current" if (crawl_runs_done > 0 or crawled_records_count > 0) else "locked"),
        "briefs": "done"
        if reports_count > 0
        else ("current" if analysed_records > 0 else "locked"),
    }


def _company_detail(db: Session, company: Company) -> dict:
    import json as _json

    latest_research_job = db.scalar(
        select(JobLog)
        .where(JobLog.company_id == company.id, JobLog.job == "job:research")
        .order_by(JobLog.id.desc())
        .limit(1)
    )
    research_error: str | None = None
    if latest_research_job and latest_research_job.status == "running":
        research_status = "running"
    elif company.profile:
        research_status = "ready"
    elif latest_research_job and latest_research_job.status == "error":
        research_status = "failed"
        try:
            parsed = _json.loads(latest_research_job.detail or "{}")
            research_error = parsed.get("error") or latest_research_job.detail
        except Exception:
            research_error = latest_research_job.detail or "Research failed"
    else:
        research_status = "queued"

    source_counts_rows = db.execute(
        select(Source.category, func.count(Source.id))
        .where(Source.company_id == company.id)
        .group_by(Source.category)
    ).all()
    category_counts = {"customers": 0, "competitors": 0, "market": 0, "internal": 0}
    for cat, cnt in source_counts_rows:
        if cat in category_counts:
            category_counts[cat] = int(cnt)

    logs = db.scalars(
        select(JobLog)
        .where(JobLog.company_id == company.id)
        .order_by(JobLog.id.desc())
        .limit(30)
    ).all()

    return {
        **_company_out(company).model_dump(mode="json"),
        "profile": company.profile,
        "research_status": research_status,
        "research_job_id": latest_research_job.id if latest_research_job else None,
        "research_error": research_error,
        "workflow_status": _compute_workflow_status(db, company),
        "category_counts": category_counts,
        "research_logs": [
            {
                "id": row.id,
                "job": row.job,
                "status": row.status,
                "at": row.at.isoformat(),
                "detail": row.detail,
            }
            for row in logs
        ],
    }


@router.get("/companies/{company_id}", tags=["companies"])
def get_company(company_id: int, db: Session = Depends(get_db)) -> dict:
    company = get_company_or_404(db, company_id)
    return _company_detail(db, company)


@router.get("/companies/{company_id}/overview", tags=["companies"])
def get_company_overview(company_id: int, db: Session = Depends(get_db)) -> dict:
    import os

    get_company_or_404(db, company_id)
    sources = db.scalars(select(Source).where(Source.company_id == company_id)).all()
    categories = ("customers", "competitors", "market", "internal")
    by_category: dict[str, dict[str, int]] = {
        cat: {"approved": 0, "pending": 0, "paused": 0, "rejected": 0, "total": 0}
        for cat in categories
    }
    for s in sources:
        bucket = by_category.setdefault(s.category, {"approved": 0, "pending": 0, "paused": 0, "rejected": 0, "total": 0})
        bucket["total"] += 1
        if s.status in bucket:
            bucket[s.status] += 1

    records_total = db.scalar(select(func.count(Record.id)).where(Record.company_id == company_id)) or 0
    records_analysed = (
        db.scalar(
            select(func.count(Record.id)).where(
                Record.company_id == company_id, Record.analysis.is_not(None)
            )
        )
        or 0
    )
    latest_crawl = db.scalar(
        select(JobLog)
        .where(JobLog.company_id == company_id, JobLog.job == "crawl")
        .order_by(JobLog.id.desc())
        .limit(1)
    )
    latest_automation = db.scalar(
        select(JobLog)
        .where(JobLog.company_id == company_id, JobLog.job.in_(("weekly", "audit")))
        .order_by(JobLog.id.desc())
        .limit(1)
    )
    latest_report = db.scalar(
        select(Report)
        .where(Report.company_id == company_id)
        .order_by(Report.id.desc())
        .limit(1)
    )

    return {
        "company_id": company_id,
        "sources_by_category": by_category,
        "records_total": records_total,
        "records_analysed": records_analysed,
        "latest_crawl": (
            {
                "id": latest_crawl.id,
                "status": latest_crawl.status,
                "at": latest_crawl.at.isoformat(),
                "detail": latest_crawl.detail,
            }
            if latest_crawl
            else None
        ),
        "latest_report": (
            {
                "id": latest_report.id,
                "created": latest_report.created.isoformat(),
                "actions": len((latest_report.content or {}).get("actions", [])),
            }
            if latest_report
            else None
        ),
        "latest_automation": (
            {
                "job": latest_automation.job,
                "status": latest_automation.status,
                "at": latest_automation.at.isoformat(),
            }
            if latest_automation
            else None
        ),
        "scheduler_enabled": os.getenv("ENABLE_SCHEDULER", "0") == "1",
    }


@router.patch("/companies/{company_id}", tags=["companies"])
def update_company(
    company_id: int, payload: CompanyUpdate, db: Session = Depends(get_db)
) -> dict:
    company = get_company_or_404(db, company_id)
    if payload.name is not None:
        company.name = payload.name.strip()
    if payload.website is not None:
        company.website = _validate_http_url(payload.website)
    if payload.context is not None:
        company.context = payload.context

    profile_fields = (
        "summary",
        "industry",
        "business_model",
        "value_proposition",
        "positioning",
        "headquarters",
        "founded",
        "company_size",
        "primary_region",
        "primary_language",
        "products",
        "customers",
        "likely_competitors",
        "competitor_decisions",
        "unverified",
    )
    patch_data = payload.model_dump(exclude_none=True)
    if any(k in patch_data for k in profile_fields):
        profile = dict(company.profile or {})
        for field in profile_fields:
            if field in patch_data:
                profile[field] = patch_data[field]
        meta = dict(profile.get("_meta") or {})
        from datetime import datetime, timezone

        meta["updated_at"] = datetime.now(timezone.utc).isoformat()
        profile["_meta"] = meta
        company.profile = profile

    db.commit()
    db.refresh(company)
    return _company_detail(db, company)


@router.post("/companies/{company_id}/confirm", tags=["companies", "research"])
def confirm_company_profile(company_id: int, db: Session = Depends(get_db)) -> dict:
    from datetime import datetime, timezone

    company = get_company_or_404(db, company_id)
    if not company.profile:
        raise HTTPException(status_code=400, detail="no profile yet; run research first")
    profile = dict(company.profile)
    meta = dict(profile.get("_meta") or {})
    confirmed_at = datetime.now(timezone.utc).isoformat()
    meta["confirmed_at"] = confirmed_at
    profile["_meta"] = meta
    company.profile = profile
    db.add(
        JobLog(
            company_id=company.id,
            job="profile_confirm",
            status="ok",
            detail=f"Profile confirmed at {confirmed_at}",
        )
    )
    db.commit()
    db.refresh(company)
    return {
        "company_id": company.id,
        "confirmed": True,
        "confirmed_at": confirmed_at,
        "workflow_status": _compute_workflow_status(db, company),
    }


# --------------------------------------------------------------------------- #
# Research / profile
# --------------------------------------------------------------------------- #
_TRANSPORT_MARKERS = (
    "transport error",
    "timeout",
    "could not fetch any page",
    "connecterror",
    "apiconnectionerror",
    "ssl",
    "certificate",
    "eof",
    "connection refused",
    "connection reset",
)


def _is_transport_message(message: str) -> bool:
    lowered = (message or "").lower()
    return any(marker in lowered for marker in _TRANSPORT_MARKERS)


@router.post("/companies/{company_id}/research", tags=["research"])
def run_research(company_id: int, db: Session = Depends(get_db)) -> dict:
    import net_diag

    company = get_company_or_404(db, company_id)
    try:
        profile = research.research_company(db, company)
    except research.ResearchError as exc:
        detail = str(exc)
        if _is_transport_message(detail) and "[net_diag:" not in detail:
            detail = f"{detail} {net_diag.format_transport_hint(company.website)}"
        raise HTTPException(status_code=502, detail=detail) from exc
    return {
        "company_id": company.id,
        "profile": profile,
        "pages_fetched": profile.get("_meta", {}).get("pages_fetched", []),
        "unverified_count": len(profile.get("unverified", [])),
    }


@router.get("/companies/{company_id}/profile", tags=["research"])
def get_profile(company_id: int, db: Session = Depends(get_db)) -> dict:
    company = get_company_or_404(db, company_id)
    if not company.profile:
        raise HTTPException(status_code=404, detail="no profile yet; POST /research first")
    return company.profile


@router.patch("/companies/{company_id}/profile", tags=["research"])
def patch_profile(
    company_id: int, payload: ProfilePatch, db: Session = Depends(get_db)
) -> dict:
    company = get_company_or_404(db, company_id)
    if not company.profile:
        raise HTTPException(status_code=404, detail="no profile yet; POST /research first")
    profile = dict(company.profile)
    for field, value in payload.model_dump(exclude_none=True).items():
        profile[field] = value
    company.profile = profile
    db.commit()
    db.refresh(company)
    return company.profile


# --------------------------------------------------------------------------- #
# Interview
# --------------------------------------------------------------------------- #
@router.post("/companies/{company_id}/interview/start", tags=["interview"])
def start_interview(company_id: int, db: Session = Depends(get_db)) -> dict:
    company = get_company_or_404(db, company_id)
    try:
        return interview.start(db, company)
    except interview.InterviewError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/companies/{company_id}/interview", tags=["interview"])
def get_interview(company_id: int, db: Session = Depends(get_db)) -> dict:
    company = get_company_or_404(db, company_id)
    return interview.state(db, company)


@router.post("/companies/{company_id}/interview/answer", tags=["interview"])
def answer_question(
    company_id: int, payload: AnswerIn, db: Session = Depends(get_db)
) -> dict:
    company = get_company_or_404(db, company_id)
    target_idx = payload.turnIndex if payload.turnIndex is not None else payload.idx
    if target_idx is None:
        raise HTTPException(status_code=400, detail="idx or turnIndex is required")
    answer_text = payload.text if payload.text is not None else payload.answer
    try:
        return interview.answer(
            db,
            company,
            target_idx,
            answer_text,
            payload.skip,
            quoted_text=payload.quotedText,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except interview.InterviewError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/companies/{company_id}/interview/skip", tags=["interview"])
def skip_question_endpoint(
    company_id: int, payload: SkipIn, db: Session = Depends(get_db)
) -> dict:
    company = get_company_or_404(db, company_id)
    target_idx = payload.turnIndex if payload.turnIndex is not None else payload.idx
    if target_idx is None:
        raise HTTPException(status_code=400, detail="turnIndex is required")
    try:
        return interview.answer(db, company, target_idx, None, skip=True)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except interview.InterviewError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/companies/{company_id}/interview/answers/{turn_index}", tags=["interview"])
def edit_answer_by_turn_endpoint(
    company_id: int, turn_index: int, payload: AnswerEdit, db: Session = Depends(get_db)
) -> dict:
    company = get_company_or_404(db, company_id)
    new_text = payload.text if payload.text is not None else payload.answer
    if not new_text or not new_text.strip():
        raise HTTPException(status_code=400, detail="answer text is required")
    try:
        return interview.edit_answer_by_turn(db, company, turn_index, new_text)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except interview.InterviewError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/interview/answers/{qa_id}", tags=["interview"])
def edit_answer(qa_id: int, payload: AnswerEdit, db: Session = Depends(get_db)) -> dict:
    row = db.get(QA, qa_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"answer {qa_id} not found")
    company = get_company_or_404(db, row.company_id)
    new_text = payload.text if payload.text is not None else payload.answer
    if not new_text or not new_text.strip():
        raise HTTPException(status_code=400, detail="answer text is required")
    try:
        return interview.edit_answer(db, company, qa_id, new_text)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except interview.InterviewError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/companies/{company_id}/interview/reset", tags=["interview"])
def reset_interview_endpoint(company_id: int, db: Session = Depends(get_db)) -> dict:
    company = get_company_or_404(db, company_id)
    return interview.reset(db, company)


@router.post("/companies/{company_id}/interview/complete", tags=["interview"])
def complete_interview(company_id: int, db: Session = Depends(get_db)) -> dict:
    company = get_company_or_404(db, company_id)
    try:
        intelligence = interview.complete(db, company)
    except interview.InterviewError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"company_id": company.id, "intelligence": intelligence}


# --------------------------------------------------------------------------- #
# Sources (Phase 4 / P1 source management)
# --------------------------------------------------------------------------- #
@router.get("/companies/{company_id}/sources", tags=["sources"])
def list_sources(
    company_id: int,
    status: str | None = Query(default=None),
    category: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    get_company_or_404(db, company_id)
    query = select(Source).where(Source.company_id == company_id)
    if status:
        query = query.where(Source.status == status)
    if category:
        query = query.where(Source.category == category)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(Source.category, Source.id).limit(limit).offset(offset)).all()
    return {
        "items": [_source_dict(source) for source in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
        "counts_by_status": _status_counts(db, company_id),
    }


def _status_counts(db: Session, company_id: int) -> dict:
    rows = db.execute(
        select(Source.status, func.count()).where(Source.company_id == company_id).group_by(Source.status)
    ).all()
    return {status: count for status, count in rows}


def _source_dict(source: Source) -> dict:
    return {
        "id": source.id,
        "name": source.name,
        "url": source.url,
        "feed_url": source.feed_url,
        "category": source.category,
        "source_type": source.source_type,
        "description": source.description,
        "update_frequency": source.update_frequency,
        "status": source.status,
        "health": source.health,
        "reliability": source.reliability,
        "relevance": source.relevance,
        "relevance_reason": source.relevance_reason,
        "reason": source.reason,
        "expected": source.expected,
        "last_checked": source.last_checked.isoformat() if source.last_checked else None,
        "last_ok": source.last_ok.isoformat() if source.last_ok else None,
        "last_error": source.last_error,
        "created": source.created.isoformat() if source.created else None,
    }


@router.post("/companies/{company_id}/sources/discover", tags=["sources"])
def discover_sources(company_id: int, db: Session = Depends(get_db)) -> dict:
    import discovery
    import llm
    import net_diag

    company = get_company_or_404(db, company_id)
    try:
        return discovery.discover(db, company)
    except discovery.DiscoveryError as exc:
        detail = str(exc)
        if _is_transport_message(detail):
            if "[net_diag:" not in detail:
                detail = f"{detail} {net_diag.format_transport_hint('https://api.groq.com/')}"
            raise HTTPException(status_code=502, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc
    except llm.LLMError as exc:
        detail = str(exc)
        if _is_transport_message(detail) and "[net_diag:" not in detail:
            detail = f"{detail} {net_diag.format_transport_hint('https://api.groq.com/')}"
            raise HTTPException(status_code=502, detail=detail) from exc
        raise HTTPException(status_code=503, detail=detail) from exc


@router.post("/companies/{company_id}/sources", status_code=201, tags=["sources"])
def add_source(company_id: int, payload: SourceCreate, db: Session = Depends(get_db)):
    import discovery
    from research import canonical_url_key

    company = get_company_or_404(db, company_id)
    raw_url = payload.url.strip()
    if not raw_url.lower().startswith(("http://", "https://")):
        raw_url = f"https://{raw_url}"
    _validate_http_url(raw_url, "url")
    existing = db.scalars(select(Source).where(Source.company_id == company_id)).all()
    existing_keys = {canonical_url_key(source.url) for source in existing}
    if canonical_url_key(raw_url) in existing_keys:
        raise HTTPException(status_code=409, detail="this source already exists for the company")

    ok, detail, final_url, feed_url = discovery.verify_candidate(raw_url)
    if canonical_url_key(final_url) in existing_keys:
        raise HTTPException(status_code=409, detail="this source already exists for the company")
    detail_lower = (detail or "").lower()
    robots_blocked = "robots" in detail_lower
    validation = {
        "reachable": bool(ok),
        "robotsAllowed": not robots_blocked,
        "feedFound": bool(feed_url),
        "readableText": bool(ok),
        "detail": detail,
    }

    if not ok:
        if robots_blocked or not payload.forceAdd:
            return JSONResponse(
                status_code=400,
                content={
                    "detail": f"source could not be fetched: {detail}",
                    "validation": validation,
                },
            )

    effective_feed = payload.feed_url or feed_url
    parsed_host = urlparse(final_url).hostname or final_url
    clean_name = payload.name.strip() or parsed_host.replace("www.", "")
    source = Source(
        company_id=company_id,
        name=clean_name,
        url=final_url,
        feed_url=effective_feed,
        category=payload.category,
        source_type=payload.source_type or ("rss" if effective_feed else "webpage"),
        description=payload.description or payload.reason,
        reason=payload.reason or "Added manually by founder.",
        expected=payload.expected,
        reliability=payload.reliability,
        update_frequency=payload.update_frequency or ("daily" if effective_feed else "weekly"),
        status="pending",
        health="ok" if ok else "error",
        last_error=None if ok else detail,
    )
    db.add(source)
    db.commit()
    db.refresh(source)

    profile = dict(company.profile or {})
    src_meta = dict(profile.get("source_meta") or {})
    src_meta[str(source.id)] = {**(src_meta.get(str(source.id)) or {}), "isCustom": True}
    profile["source_meta"] = src_meta
    company.profile = profile
    db.commit()

    out = _source_dict(source)
    out["validation"] = validation
    out["normalized"] = _signal_stack_source(db, company, source)
    return out


@router.patch("/sources/{source_id}", tags=["sources"])
def update_source(source_id: int, payload: SourcePatch, db: Session = Depends(get_db)) -> dict:
    source = db.get(Source, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail=f"source {source_id} not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(source, field, value)
    db.commit()
    db.refresh(source)
    return _source_dict(source)


@router.post("/sources/{source_id}/approve", tags=["sources"])
def approve_source(source_id: int, db: Session = Depends(get_db)) -> dict:
    source = db.get(Source, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail=f"source {source_id} not found")
    source.status = "approved"
    if source.health == "unknown":
        source.health = "ok"
    db.commit()
    db.refresh(source)
    return _source_dict(source)


@router.delete("/sources/{source_id}", status_code=204, tags=["sources"])
def delete_source(source_id: int, db: Session = Depends(get_db)) -> Response:
    source = db.get(Source, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail=f"source {source_id} not found")
    db.delete(source)
    db.commit()
    return Response(status_code=204)


# --------------------------------------------------------------------------- #
# Crawl, intelligence, signals (Phase 5)
# --------------------------------------------------------------------------- #
@router.post("/companies/{company_id}/crawl", tags=["crawl"])
def run_crawl(company_id: int, db: Session = Depends(get_db)) -> dict:
    import crawler

    company = get_company_or_404(db, company_id)
    return crawler.crawl_company(db, company)


@router.post("/companies/{company_id}/analyse", tags=["crawl"])
def run_analysis(
    company_id: int,
    limit: int | None = Query(default=None, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    import analysis

    company = get_company_or_404(db, company_id)
    return analysis.analyse_pending(db, company, limit=limit)


@router.get("/companies/{company_id}/crawl-history", tags=["crawl"])
def crawl_history(
    company_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict:
    get_company_or_404(db, company_id)
    rows = db.scalars(
        select(JobLog)
        .where(JobLog.company_id == company_id, JobLog.job.in_(("crawl", "analyse", "audit")))
        .order_by(JobLog.id.desc())
        .limit(limit)
    ).all()
    return {
        "items": [
            {"id": row.id, "job": row.job, "status": row.status, "at": row.at.isoformat(), "detail": row.detail}
            for row in rows
        ]
    }


@router.get("/companies/{company_id}/crawl-diagnostics", tags=["crawl"])
def crawl_diagnostics(company_id: int, db: Session = Depends(get_db)) -> dict:
    import json as _json

    get_company_or_404(db, company_id)
    failing_sources = db.scalars(
        select(Source)
        .where(Source.company_id == company_id, (Source.health == "error") | Source.last_error.is_not(None))
        .order_by(Source.id.desc())
    ).all()
    crawl_logs = db.scalars(
        select(JobLog)
        .where(JobLog.company_id == company_id, JobLog.job == "crawl")
        .order_by(JobLog.id.desc())
        .limit(20)
    ).all()

    duplicate_entries: list[dict] = []
    total_duplicates_logged = 0
    history: list[dict] = []
    for row in crawl_logs:
        parsed = {}
        try:
            parsed = _json.loads(row.detail)
        except Exception:
            parsed = {}
        dups = int(parsed.get("duplicates", 0) or 0)
        total_duplicates_logged += dups
        for entry in parsed.get("duplicate_entries") or []:
            duplicate_entries.append({**entry, "at": row.at.isoformat()})
        history.append(
            {
                "id": row.id,
                "status": row.status,
                "at": row.at.isoformat(),
                "sources_checked": parsed.get("sources_checked", 0),
                "new_records": parsed.get("new_records", 0),
                "updated_records": parsed.get("updated_records", 0),
                "duplicates": dups,
                "errors": parsed.get("errors", 0),
                "per_source": parsed.get("per_source", []),
            }
        )

    return {
        "failing_sources": [_source_dict(s) for s in failing_sources],
        "total_duplicates_logged": total_duplicates_logged,
        "duplicate_entries": duplicate_entries[:80],
        "history": history,
    }


@router.post("/companies/{company_id}/competitors/discover", tags=["competitors"])
def discover_competitors_route(company_id: int, db: Session = Depends(get_db)) -> dict:
    import competitors

    company = get_company_or_404(db, company_id)
    return competitors.discover_competitors(db, company)


@router.get("/companies/{company_id}/competitors", tags=["competitors"])
def list_competitors_route(company_id: int, db: Session = Depends(get_db)) -> dict:
    import competitors

    company = get_company_or_404(db, company_id)
    return competitors.list_competitors(db, company)


_CORROBORATION_STOPWORDS = frozenset(
    {
        "this", "that", "with", "from", "have", "were", "been", "they", "their", "about",
        "which", "when", "where", "there", "these", "those", "into", "over", "after", "under",
        "company", "companies", "market", "industry", "report", "news", "update", "updated",
    }
)


def _signal_tokens(record: Record) -> set[str]:
    import re as _re

    analysis_data = record.analysis or {}
    text = f"{record.title or ''} {analysis_data.get('summary') or ''}".lower()
    return {
        tok
        for tok in _re.findall(r"[a-z0-9]{4,}", text)
        if tok not in _CORROBORATION_STOPWORDS
    }


def _related_records_map(rows: list[tuple[Record, Source | None]]) -> dict[int, list[dict]]:
    token_by_id = {record.id: _signal_tokens(record) for record, _ in rows}
    result: dict[int, list[dict]] = {record.id: [] for record, _ in rows}
    for idx, (rec_a, _src_a) in enumerate(rows):
        toks_a = token_by_id[rec_a.id]
        if len(toks_a) < 3:
            continue
        matches: list[tuple[int, Record, Source | None]] = []
        for rec_b, src_b in rows:
            if rec_b.id == rec_a.id or rec_b.source_id == rec_a.source_id:
                continue
            overlap = len(toks_a & token_by_id[rec_b.id])
            if overlap >= 3:
                matches.append((overlap, rec_b, src_b))
        matches.sort(key=lambda item: (-item[0], -item[1].total))
        result[rec_a.id] = [
            {
                "id": rec_b.id,
                "title": rec_b.title,
                "source_id": rec_b.source_id,
                "source_name": src_b.name if src_b else "unknown",
                "total": rec_b.total,
                "overlap_terms": overlap,
            }
            for overlap, rec_b, src_b in matches[:3]
        ]
    return result


@router.get("/companies/{company_id}/intelligence", tags=["crawl"])
def intelligence(
    company_id: int,
    category: str | None = Query(default=None),
    source_id: int | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    min_score: float = Query(default=0.0, ge=0.0, le=100.0),
    min_relevance: float | None = Query(default=None, ge=0.0, le=1.0),
    min_impact: float | None = Query(default=None, ge=0.0, le=1.0),
    verified_only: bool | None = Query(default=None),
    priority_band: str | None = Query(default=None),
    classification: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    from datetime import datetime as _dt, timezone as _tz

    company = get_company_or_404(db, company_id)
    query = (
        select(Record, Source)
        .join(Source, Record.source_id == Source.id, isouter=True)
        .where(Record.company_id == company_id, Record.analysis.is_not(None), Record.total >= min_score)
    )
    if category:
        query = query.where(Source.category == category)
    if source_id is not None:
        query = query.where(Record.source_id == source_id)
    if priority_band == "high":
        query = query.where(Record.total >= 70.0)
    elif priority_band == "medium":
        query = query.where(Record.total >= 40.0, Record.total < 70.0)
    elif priority_band == "low":
        query = query.where(Record.total < 40.0)

    all_company_rows = db.execute(
        select(Record, Source)
        .join(Source, Record.source_id == Source.id, isouter=True)
        .where(Record.company_id == company_id, Record.analysis.is_not(None))
    ).all()
    related_map = _related_records_map(all_company_rows)

    rows = db.execute(query.order_by(Record.total.desc(), Record.id.desc())).all()

    from_dt = _dt.fromisoformat(date_from).replace(tzinfo=_tz.utc) if date_from else None
    to_dt = (
        _dt.fromisoformat(date_to).replace(hour=23, minute=59, second=59, tzinfo=_tz.utc)
        if date_to
        else None
    )
    needle = (q or "").strip().lower()

    filtered: list[tuple[Record, Source | None]] = []
    for record, source in rows:
        a = record.analysis or {}
        s = record.scores or {}
        if classification and (a.get("classification") or "neutral") != classification:
            continue
        if verified_only is True and a.get("evidence_verbatim") is not True:
            continue
        if verified_only is False and a.get("evidence_verbatim") is not False:
            continue
        rel = a.get("relevance") if a.get("relevance") is not None else s.get("relevance")
        if min_relevance is not None and (rel is None or float(rel) < min_relevance):
            continue
        imp = a.get("impact") if a.get("impact") is not None else s.get("impact")
        if min_impact is not None and (imp is None or float(imp) < min_impact):
            continue
        if from_dt is not None and record.discovered:
            disc = record.discovered if record.discovered.tzinfo else record.discovered.replace(tzinfo=_tz.utc)
            if disc < from_dt:
                continue
        if to_dt is not None and record.discovered:
            disc = record.discovered if record.discovered.tzinfo else record.discovered.replace(tzinfo=_tz.utc)
            if disc > to_dt:
                continue
        if needle:
            hay = f"{record.title} {a.get('summary', '')} {record.text[:1000]}".lower()
            if needle not in hay:
                continue
        filtered.append((record, source))

    total = len(filtered)
    page_rows = filtered[offset : offset + limit]
    return {
        "company_id": company.id,
        "items": [_record_dict(record, source, related=related_map.get(record.id, [])) for record, source in page_rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def _record_dict(record: Record, source: Source | None, *, related: list[dict] | None = None) -> dict:
    analysis_data = record.analysis or {}
    rel_list = related if related is not None else []
    return {
        "id": record.id,
        "url": record.url,
        "title": record.title,
        "published": record.published.isoformat() if record.published else None,
        "discovered": record.discovered.isoformat() if record.discovered else None,
        "content_hash": record.content_hash,
        "is_update": record.is_update,
        "total": record.total,
        "scores": record.scores,
        "explanation": (record.scores or {}).get("explanation"),
        "analysis": analysis_data,
        "summary": analysis_data.get("summary"),
        "evidence_snippet": analysis_data.get("evidence_snippet"),
        "evidence_verbatim": analysis_data.get("evidence_verbatim"),
        "evidence_strength": analysis_data.get("evidence_strength"),
        "source_reliability": analysis_data.get("source_reliability"),
        "strategic_relevance": analysis_data.get("strategic_relevance"),
        "classification": analysis_data.get("classification", "neutral"),
        "corroborated": len(rel_list) > 0,
        "related_records": rel_list,
        "source": {"id": source.id, "name": source.name, "category": source.category} if source else None,
        "text_preview": record.text[:600],
    }


@router.get("/signals/{record_id}", tags=["crawl"])
def get_signal(record_id: int, db: Session = Depends(get_db)) -> dict:
    record = db.get(Record, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"signal {record_id} not found")
    source = db.get(Source, record.source_id) if record.source_id else None
    return _record_dict(record, source)


# --------------------------------------------------------------------------- #
# Documents (Phase 8)
# --------------------------------------------------------------------------- #
@router.post("/companies/{company_id}/documents", status_code=201, tags=["documents"])
async def upload_document(
    company_id: int,
    file: UploadFile = File(...),
    document_type: str = Form("general"),
    db: Session = Depends(get_db),
) -> dict:
    import documents

    company = get_company_or_404(db, company_id)
    raw = await file.read()
    try:
        stored = documents.store_document(
            db, company, file.filename or "upload.txt", raw, document_type=document_type
        )
    except documents.UploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return stored


@router.get("/companies/{company_id}/documents", tags=["documents"])
def list_documents(company_id: int, db: Session = Depends(get_db)) -> dict:
    import documents

    company = get_company_or_404(db, company_id)
    rows = documents.list_documents(db, company)
    return {"items": rows, "total": len(rows)}


# --------------------------------------------------------------------------- #
# Reports (Phase 6)
# --------------------------------------------------------------------------- #
@router.post("/companies/{company_id}/reports/generate", status_code=201, tags=["reports"])
def generate_report(company_id: int, db: Session = Depends(get_db)) -> dict:
    import brief

    company = get_company_or_404(db, company_id)
    try:
        report = brief.generate(db, company)
    except brief.BriefError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _report_dict(report, include_markdown=True)


def _report_dict(report: Report, *, include_markdown: bool = False) -> dict:
    payload = {
        "id": report.id,
        "company_id": report.company_id,
        "created": report.created.isoformat(),
        "content": report.content,
    }
    if include_markdown:
        payload["markdown"] = report.markdown
    return payload


@router.get("/companies/{company_id}/reports", tags=["reports"])
def list_reports(
    company_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    get_company_or_404(db, company_id)
    query = select(Report).where(Report.company_id == company_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(Report.id.desc()).limit(limit).offset(offset)).all()
    return {
        "items": [
            {
                "id": report.id,
                "created": report.created.isoformat(),
                "generated_at": report.content.get("generated_at"),
                "actions": len(report.content.get("actions", [])),
                "top_signal": (report.content.get("top_signals") or [{}])[0].get("title")
                if report.content.get("top_signals")
                else None,
            }
            for report in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/reports/{report_id}", tags=["reports"])
def get_report(report_id: int, db: Session = Depends(get_db)) -> dict:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"report {report_id} not found")
    return _report_dict(report, include_markdown=True)


@router.get("/reports/{report_id}/export", tags=["reports"])
def export_report(report_id: int, db: Session = Depends(get_db)) -> Response:
    import brief

    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"report {report_id} not found")
    markdown = report.markdown or brief.render_markdown(report.content)
    filename = f"brief-{report.company_id}-{report.id}.md"
    return Response(
        content=markdown,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/reports/{report_id}/actions/{action_index}", tags=["reports"])
def toggle_action(
    report_id: int, action_index: int, payload: ActionToggle, db: Session = Depends(get_db)
) -> dict:
    import brief

    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"report {report_id} not found")
    content = dict(report.content)
    actions = list(content.get("actions", []))
    if not 0 <= action_index < len(actions):
        raise HTTPException(status_code=404, detail=f"action {action_index} not found in report {report_id}")
    actions[action_index] = {**actions[action_index], "done": payload.done}
    content["actions"] = actions
    report.content = content
    report.markdown = brief.render_markdown(content)
    db.commit()
    return {"report_id": report.id, "actions": actions}


# --------------------------------------------------------------------------- #
# Automation and context (Phase 8)
# --------------------------------------------------------------------------- #
@router.post("/companies/{company_id}/automation/run", tags=["automation"])
def run_automation(company_id: int, db: Session = Depends(get_db)) -> dict:
    import audit

    company = get_company_or_404(db, company_id)
    return audit.run_weekly(db, company)


@router.post("/companies/{company_id}/source-audit", tags=["automation"])
def run_source_audit(company_id: int, db: Session = Depends(get_db)) -> dict:
    import audit

    company = get_company_or_404(db, company_id)
    return audit.audit_sources(db, company)


@router.get("/companies/{company_id}/job-logs", tags=["automation"])
def job_logs(
    company_id: int,
    limit: int = Query(default=30, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    get_company_or_404(db, company_id)
    query = select(JobLog).where(JobLog.company_id == company_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(JobLog.id.desc()).limit(limit).offset(offset)).all()
    return {
        "items": [
            {"id": row.id, "job": row.job, "status": row.status, "at": row.at.isoformat(), "detail": row.detail}
            for row in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/companies/{company_id}/jobs/{kind}", status_code=202, tags=["jobs"])
def start_job_route(
    company_id: int,
    kind: str,
    limit: int | None = Query(default=None, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    import jobs

    try:
        return jobs.start_company_job(db, company_id, kind, limit=limit)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/jobs/{job_id}", tags=["jobs"])
def get_job_route(job_id: int, db: Session = Depends(get_db)) -> dict:
    import jobs

    try:
        return jobs.get_job_status(db, job_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/companies/{company_id}/context/reassess", tags=["context"])
def reassess_context(company_id: int, payload: ContextIn, db: Session = Depends(get_db)) -> dict:
    import context as context_module

    company = get_company_or_404(db, company_id)
    try:
        return context_module.reassess(db, company, payload.context, run_discovery=payload.run_discovery)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --------------------------------------------------------------------------- #
# Signal Stack Builder endpoints
# --------------------------------------------------------------------------- #
_RECOMMENDED_THRESHOLD = 60


def _map_source_status(source: Source) -> tuple[str, bool]:
    err_lower = (source.last_error or "").lower()
    robots_allowed = not (source.health == "blocked" or "robots" in err_lower)
    if not robots_allowed:
        return "blocked", False
    if source.health == "error":
        return "failing", True
    if source.status == "approved":
        return "approved", True
    if source.status in ("rejected", "paused"):
        return "rejected", True
    return "needs_review", True


def _normalize_frequency(freq: str | None) -> str:
    if freq in ("hourly", "daily", "weekly"):
        return freq
    return "weekly"


def _signal_stack_source(db: Session, company: Company, source: Source) -> dict:
    parsed = urlparse(source.url)
    domain = (parsed.hostname or source.url).replace("www.", "")
    mapped_status, robots_allowed = _map_source_status(source)

    raw_rel = source.relevance if source.relevance is not None else source.reliability
    relevance_score = max(0, min(100, int(round(float(raw_rel or 0.5) * 100))))

    if source.feed_url or source.source_type == "rss":
        crawl_method = "rss"
    elif "sitemap" in source.url.lower():
        crawl_method = "sitemap"
    else:
        crawl_method = "html"

    conf = "high" if source.reliability >= 0.75 else ("medium" if source.reliability >= 0.5 else "low")
    profile = company.profile or {}
    meta_map = profile.get("source_meta") or {}
    s_meta = meta_map.get(str(source.id)) or {}

    pages_fetched = (profile.get("_meta") or {}).get("pages_fetched") or []
    evidence_ids = list(s_meta.get("evidenceIds") or [])
    if not evidence_ids and pages_fetched:
        evidence_ids = [pages_fetched[0]]

    score_reasons = list(s_meta.get("scoreReasons") or [])
    if not score_reasons:
        if source.relevance_reason:
            score_reasons.append({"label": source.relevance_reason, "weight": relevance_score})
        else:
            score_reasons.append(
                {
                    "label": f"Source reliability ({int(round(source.reliability * 100))}%)",
                    "weight": int(round(source.reliability * 100)),
                }
            )

    sub_sources = list(s_meta.get("subSources") or [])
    if source.feed_url and not sub_sources:
        sub_sources = [{"name": "RSS / Atom Feed", "url": source.feed_url}]

    return {
        "id": source.id,
        "companyId": company.id,
        "name": source.name,
        "url": source.url,
        "domain": domain,
        "category": source.category,
        "type": s_meta.get("type") or source.source_type or "webpage",
        "crawlMethod": crawl_method,
        "language": s_meta.get("language") or "English",
        "status": mapped_status,
        "relevanceScore": relevance_score,
        "scoreReasons": score_reasons,
        "whyRecommended": source.description or source.reason or "Discovered for company monitoring.",
        "evidenceIds": evidence_ids,
        "discoveryConfidence": conf,
        "frequency": _normalize_frequency(source.update_frequency),
        "lastCheckedAt": source.last_checked.isoformat() if source.last_checked else None,
        "lastError": source.last_error,
        "robotsAllowed": robots_allowed,
        "isChecking": False,
        "subSources": sub_sources,
        "isCustom": bool(s_meta.get("isCustom", False)),
        "maxPages": s_meta.get("maxPages") or 10,
        "includePatterns": s_meta.get("includePatterns") or "",
        "excludePatterns": s_meta.get("excludePatterns") or "",
        "lastHttpStatus": s_meta.get("lastHttpStatus"),
        "recentCrawls": s_meta.get("recentCrawls") or [],
    }


def _apply_source_patch(company: Company, source: Source, payload: SourcePatch) -> None:
    data = payload.model_dump(exclude_none=True)
    if "status" in data:
        req_status = data["status"]
        if req_status == "approved":
            _, robots_allowed = _map_source_status(source)
            if not robots_allowed:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot approve a source disallowed by robots.txt",
                )
            source.status = "approved"
            if source.health == "unknown":
                source.health = "ok"
        elif req_status in ("needs_review", "pending"):
            source.status = "pending"
        elif req_status in ("rejected", "paused"):
            source.status = req_status

    if "name" in data:
        source.name = data["name"].strip() or source.name
    if "url" in data:
        source.url = _validate_http_url(data["url"], "url")
    if "category" in data:
        source.category = data["category"]
    if "description" in data:
        source.description = data["description"]
    if "expected" in data:
        source.expected = data["expected"]
    if "relevance" in data:
        source.relevance = data["relevance"]
    if "frequency" in data or "update_frequency" in data:
        source.update_frequency = _normalize_frequency(
            data.get("frequency") or data.get("update_frequency")
        )
    if "type" in data:
        source.source_type = data["type"]

    meta_keys = ("type", "maxPages", "includePatterns", "excludePatterns")
    if any(k in data for k in meta_keys):
        profile = dict(company.profile or {})
        meta_map = dict(profile.get("source_meta") or {})
        s_meta = dict(meta_map.get(str(source.id)) or {})
        for k in meta_keys:
            if k in data:
                s_meta[k] = data[k]
        meta_map[str(source.id)] = s_meta
        profile["source_meta"] = meta_map
        company.profile = profile


def _signal_stack_payload(db: Session, company: Company) -> dict:
    import json as _json
    import documents

    all_sources = list(
        db.scalars(
            select(Source)
            .where(Source.company_id == company.id, Source.category != "internal")
            .order_by(Source.category, Source.id)
        ).all()
    )
    normalized = [_signal_stack_source(db, company, s) for s in all_sources]

    counts = {
        "customers": 0,
        "competitors": 0,
        "market": 0,
        "internal": 0,
        "approved": 0,
        "needs_review": 0,
        "rejected": 0,
        "failing": 0,
        "blocked": 0,
    }
    for s in normalized:
        cat = s["category"]
        if cat in counts:
            counts[cat] += 1
        st = s["status"]
        if st in counts:
            counts[st] += 1

    internal_docs = documents.list_documents(db, company)
    counts["internal"] = len(internal_docs)
    internal_files = [
        {
            "id": doc["record_id"],
            "sourceId": doc["source_id"],
            "filename": doc["filename"],
            "size": doc["characters"],
            "type": doc.get("document_type") or "general",
            "uploadedAt": doc.get("discovered"),
            "status": "analysed" if doc.get("analysed") else "uploaded",
            "summary": doc.get("insights"),
        }
        for doc in internal_docs
    ]

    latest_discover = db.scalar(
        select(JobLog)
        .where(JobLog.company_id == company.id, JobLog.job == "job:discover")
        .order_by(JobLog.id.desc())
        .limit(1)
    )
    discovery_status = "ready"
    discovery_stage = None
    discovery_error = None
    if latest_discover:
        parsed: dict = {}
        try:
            parsed = _json.loads(latest_discover.detail) if latest_discover.detail else {}
        except Exception:
            parsed = {}
        if latest_discover.status == "running":
            discovery_status = "running"
            discovery_stage = parsed.get("stage") or "Searching and verifying candidate sources"
        elif latest_discover.status == "error":
            discovery_status = "failed"
            discovery_error = parsed.get("error") or "Source discovery failed."

    profile = company.profile or {}
    meta = profile.get("_meta") or {}
    audit_proposals = list(profile.get("audit_proposals") or [])

    return {
        "sources": normalized,
        "recommendedThreshold": _RECOMMENDED_THRESHOLD,
        "auditProposals": audit_proposals,
        "discoveryStatus": discovery_status,
        "discoveryStage": discovery_stage,
        "discoveryError": discovery_error,
        "counts": counts,
        "internalFiles": internal_files,
        "maxUploadBytes": documents.MAX_UPLOAD_BYTES,
        "allowedExtensions": list(documents.ALLOWED_EXTENSIONS),
        "confirmedAt": meta.get("signal_stack_confirmed_at"),
    }


@router.get("/companies/{company_id}/signal-stack", tags=["signal-stack"])
def get_signal_stack(company_id: int, db: Session = Depends(get_db)) -> dict:
    company = get_company_or_404(db, company_id)
    return _signal_stack_payload(db, company)


@router.post("/companies/{company_id}/signal-stack/discover", status_code=202, tags=["signal-stack"])
def run_signal_stack_discovery(company_id: int, db: Session = Depends(get_db)) -> dict:
    import jobs

    get_company_or_404(db, company_id)
    return jobs.start_company_job(db, company_id, "discover")


@router.patch("/companies/{company_id}/sources/{source_id}", tags=["signal-stack"])
def patch_company_source(
    company_id: int, source_id: int, payload: SourcePatch, db: Session = Depends(get_db)
) -> dict:
    company = get_company_or_404(db, company_id)
    source = db.get(Source, source_id)
    if source is None or source.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"source {source_id} not found")
    _apply_source_patch(company, source, payload)
    db.commit()
    db.refresh(source)
    return _signal_stack_source(db, company, source)


@router.post("/companies/{company_id}/sources/bulk", tags=["signal-stack"])
def bulk_update_company_sources(
    company_id: int, payload: SourceBulkPatch, db: Session = Depends(get_db)
) -> dict:
    company = get_company_or_404(db, company_id)
    rows = db.scalars(
        select(Source).where(Source.company_id == company_id, Source.id.in_(payload.ids))
    ).all()
    updated_count = 0
    for source in rows:
        if payload.patch.status == "approved":
            _, robots_allowed = _map_source_status(source)
            if not robots_allowed:
                continue
        _apply_source_patch(company, source, payload.patch)
        updated_count += 1
    db.commit()
    out = _signal_stack_payload(db, company)
    out["updatedCount"] = updated_count
    return out


@router.post("/companies/{company_id}/sources/{source_id}/recheck", tags=["signal-stack"])
def recheck_company_source(
    company_id: int, source_id: int, db: Session = Depends(get_db)
) -> dict:
    from datetime import datetime, timezone
    import discovery

    company = get_company_or_404(db, company_id)
    source = db.get(Source, source_id)
    if source is None or source.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"source {source_id} not found")

    ok, detail, final_url, feed_url = discovery.verify_candidate(source.url)
    now = datetime.now(timezone.utc)
    source.last_checked = now
    if ok:
        source.health = "ok"
        source.last_ok = now
        source.last_error = None
        source.url = final_url
        if feed_url and not source.feed_url:
            source.feed_url = feed_url
    else:
        source.health = "blocked" if "robots" in (detail or "").lower() else "error"
        source.last_error = detail
    db.commit()
    db.refresh(source)
    return _signal_stack_source(db, company, source)


@router.delete("/companies/{company_id}/sources/{source_id}", status_code=204, tags=["signal-stack"])
def delete_company_source(
    company_id: int, source_id: int, db: Session = Depends(get_db)
) -> Response:
    get_company_or_404(db, company_id)
    source = db.get(Source, source_id)
    if source is None or source.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"source {source_id} not found")
    db.delete(source)
    db.commit()
    return Response(status_code=204)


@router.post("/companies/{company_id}/signal-stack/audit/apply", tags=["signal-stack"])
def apply_signal_stack_audit(
    company_id: int, payload: AuditApplyIn, db: Session = Depends(get_db)
) -> dict:
    company = get_company_or_404(db, company_id)
    profile = dict(company.profile or {})
    proposals = list(profile.get("audit_proposals") or [])
    decision_map = {item.proposalId: item.accepted for item in payload.decisions}
    remaining = []

    for prop in proposals:
        pid = str(prop.get("id"))
        if pid not in decision_map:
            remaining.append(prop)
            continue
        if decision_map[pid]:
            action = prop.get("action")
            src_data = prop.get("source") or {}
            src_id = src_data.get("id")
            if action == "remove" and src_id:
                row = db.get(Source, int(src_id))
                if row and row.company_id == company_id:
                    row.status = "rejected"
            elif action == "add" and src_data.get("url"):
                from research import canonical_url_key

                target_key = canonical_url_key(src_data["url"])
                existing_match = next(
                    (
                        s
                        for s in db.scalars(select(Source).where(Source.company_id == company_id)).all()
                        if canonical_url_key(s.url) == target_key
                    ),
                    None,
                )
                if existing_match is not None:
                    existing_match.status = "approved"
                    existing_match.health = "ok"
                else:
                    db.add(
                        Source(
                            company_id=company_id,
                            name=src_data.get("name") or src_data["url"],
                            url=src_data["url"],
                            category=src_data.get("category") or "market",
                            source_type=src_data.get("type") or "webpage",
                            reason=prop.get("reasoning") or "Proposed by monthly source audit",
                            status="approved",
                            health="ok",
                        )
                    )

    profile["audit_proposals"] = remaining
    company.profile = profile
    db.commit()
    return _signal_stack_payload(db, company)


@router.post("/companies/{company_id}/signal-stack/confirm", tags=["signal-stack"])
def confirm_signal_stack(company_id: int, db: Session = Depends(get_db)) -> dict:
    from datetime import datetime, timezone

    company = get_company_or_404(db, company_id)
    approved_cats = set(
        db.scalars(
            select(Source.category).where(
                Source.company_id == company_id,
                Source.status == "approved",
            )
        ).all()
    )
    missing = [cat for cat in ("customers", "competitors", "market") if cat not in approved_cats]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Approve at least 1 source in each required category: {', '.join(missing)}",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    profile = dict(company.profile or {})
    meta = dict(profile.get("_meta") or {})
    meta["signal_stack_confirmed_at"] = now_iso
    profile["_meta"] = meta
    company.profile = profile
    db.commit()
    db.refresh(company)
    return {
        "company_id": company.id,
        "confirmed": True,
        "confirmed_at": now_iso,
        "workflow_status": _compute_workflow_status(db, company),
    }


@router.post("/companies/{company_id}/internal/upload", status_code=201, tags=["signal-stack"])
async def upload_internal_file_route(
    company_id: int,
    file: UploadFile = File(...),
    document_type: str = Form("general"),
    db: Session = Depends(get_db),
) -> dict:
    import documents

    company = get_company_or_404(db, company_id)
    raw = await file.read()
    try:
        stored = documents.store_document(
            db, company, file.filename or "upload.txt", raw, document_type=document_type
        )
    except documents.UploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return stored


@router.get("/companies/{company_id}/internal/files", tags=["signal-stack"])
def list_internal_files_route(company_id: int, db: Session = Depends(get_db)) -> dict:
    import documents

    company = get_company_or_404(db, company_id)
    docs = documents.list_documents(db, company)
    return {
        "items": [
            {
                "id": doc["record_id"],
                "sourceId": doc["source_id"],
                "filename": doc["filename"],
                "size": doc["characters"],
                "type": doc.get("document_type") or "general",
                "uploadedAt": doc.get("discovered"),
                "status": "analysed" if doc.get("analysed") else "uploaded",
                "summary": doc.get("insights"),
            }
            for doc in docs
        ]
    }


@router.delete("/companies/{company_id}/internal/files/{record_id}", status_code=204, tags=["signal-stack"])
def delete_internal_file_route(
    company_id: int, record_id: int, db: Session = Depends(get_db)
) -> Response:
    get_company_or_404(db, company_id)
    record = db.get(Record, record_id)
    if record is None or record.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"file {record_id} not found")
    source_id = record.source_id
    db.delete(record)
    if source_id:
        source = db.get(Source, source_id)
        if source and source.company_id == company_id and source.category == "internal":
            db.delete(source)
    db.commit()
    return Response(status_code=204)


# --------------------------------------------------------------------------- #
# Crawler Monitor (Step 4) — backed by JobLog ("crawl_run" & "crawl_log:{id}")
# --------------------------------------------------------------------------- #
def _domain_of(url: str) -> str:
    try:
        return (urlparse(url).hostname or url).replace("www.", "")
    except Exception:
        return url


def _parse_job_json(raw: str | None) -> dict:
    import json as _json

    try:
        data = _json.loads(raw) if raw else {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _serialize_crawl_run(row: JobLog, *, include_per_source: bool = False) -> dict:
    data = _parse_job_json(row.detail)
    counts = data.get("counts") or {}
    payload: dict = {
        "id": row.id,
        "companyId": row.company_id or 0,
        "trigger": data.get("trigger") or "manual",
        "status": row.status,
        "startedAt": data.get("startedAt") or (row.at.isoformat() if row.at else None),
        "finishedAt": data.get("finishedAt"),
        "durationMs": data.get("durationMs"),
        "sourcesTotal": int(data.get("sourcesTotal", 0)),
        "sourcesDone": int(data.get("sourcesDone", 0)),
        "currentSourceDomain": data.get("currentSourceDomain"),
        "counts": {
            "new": int(counts.get("new", 0)),
            "changed": int(counts.get("changed", 0)),
            "unchanged": int(counts.get("unchanged", 0)),
            "failed": int(counts.get("failed", 0)),
            "blocked": int(counts.get("blocked", 0)),
        },
    }
    if include_per_source:
        payload["perSource"] = list(data.get("perSource") or [])
    return payload


def _serialize_log_line(row: JobLog) -> dict:
    data = _parse_job_json(row.detail)
    run_id = data.get("runId")
    if run_id is None and row.job.startswith("crawl_log:"):
        try:
            run_id = int(row.job.split(":", 1)[1])
        except ValueError:
            run_id = 0
    return {
        "id": row.id,
        "runId": int(run_id or 0),
        "ts": row.at.isoformat() if row.at else None,
        "level": row.status,
        "sourceDomain": data.get("sourceDomain"),
        "message": data.get("message") or row.detail,
    }


def _serialize_collected_item(
    record: Record,
    source: Source | None,
    *,
    excerpt_len: int = 240,
    diff: dict | None = None,
) -> dict:
    domain = _domain_of(source.url if source else record.url)
    change = "changed" if record.is_update else "new"
    method = (
        "rss"
        if (source and source.source_type == "rss" and record.published)
        else ("metadata" if record.published else None)
    )
    clean_title = record.title
    if clean_title.startswith("[UPDATED] "):
        clean_title = clean_title[len("[UPDATED] "):]
    out: dict = {
        "id": record.id,
        "sourceId": record.source_id or 0,
        "sourceName": source.name if source else domain,
        "domain": domain,
        "category": source.category if source else "market",
        "title": clean_title or record.url,
        "url": record.url,
        "publishedAt": record.published.isoformat() if record.published else None,
        "publishedAtMethod": method,
        "fetchedAt": record.discovered.isoformat() if record.discovered else None,
        "change": change,
        "contentHash": record.content_hash,
        "excerpt": (record.text or "")[:excerpt_len],
    }
    if diff is not None:
        out["diff"] = diff
    return out


def _range_days(range_key: str) -> int:
    return {"7d": 7, "30d": 30, "90d": 90}.get(range_key, 7)


def _compute_delta_pct(cur: int, prev: int) -> float | None:
    if prev <= 0:
        return None
    return round(((cur - prev) / prev) * 100.0, 1)


@router.get("/companies/{company_id}/crawler/overview", tags=["crawler"])
def get_crawler_overview(
    company_id: int,
    range_key: str = Query(default="7d", alias="range", pattern="^(7d|30d|90d)$"),
    db: Session = Depends(get_db),
) -> dict:
    from datetime import datetime, timedelta, timezone
    from config import get_settings
    import documents

    company = get_company_or_404(db, company_id)
    settings = get_settings()
    days = _range_days(range_key)
    now = datetime.now(timezone.utc)
    today_date = now.date()
    start_date = today_date - timedelta(days=days - 1)
    prev_start_date = start_date - timedelta(days=days)

    runs = list(
        db.scalars(
            select(JobLog)
            .where(JobLog.company_id == company_id, JobLog.job == "crawl_run")
            .order_by(JobLog.id.desc())
        ).all()
    )

    active_run = next((r for r in runs if r.status in ("queued", "running")), None)
    last_run = next((r for r in runs if r.status not in ("queued", "running")), None)

    daily_map: dict[str, dict] = {}
    for i in range(days):
        d = (start_date + timedelta(days=i)).isoformat()
        daily_map[d] = {
            "date": d,
            "new": 0,
            "changed": 0,
            "failed": 0,
            "sourcesChecked": 0,
        }

    cur_totals = {"new": 0, "changed": 0, "failed": 0}
    prev_totals = {"new": 0, "changed": 0, "failed": 0}
    has_prev_data = False

    for r in runs:
        if not r.at:
            continue
        r_dt = r.at if r.at.tzinfo else r.at.replace(tzinfo=timezone.utc)
        r_day = r_dt.date()
        data = _parse_job_json(r.detail)
        c = data.get("counts") or {}
        n_val = int(c.get("new", 0))
        ch_val = int(c.get("changed", 0))
        f_val = int(c.get("failed", 0)) + int(c.get("blocked", 0))
        done_val = int(data.get("sourcesDone", 0))
        if start_date <= r_day <= today_date:
            key = r_day.isoformat()
            if key in daily_map:
                daily_map[key]["new"] += n_val
                daily_map[key]["changed"] += ch_val
                daily_map[key]["failed"] += f_val
                daily_map[key]["sourcesChecked"] += done_val
            cur_totals["new"] += n_val
            cur_totals["changed"] += ch_val
            cur_totals["failed"] += f_val
        elif prev_start_date <= r_day < start_date:
            has_prev_data = True
            prev_totals["new"] += n_val
            prev_totals["changed"] += ch_val
            prev_totals["failed"] += f_val

    approved_sources = list(
        db.scalars(
            select(Source)
            .where(
                Source.company_id == company_id,
                Source.status == "approved",
                Source.category != "internal",
            )
            .order_by(Source.id)
        ).all()
    )

    all_public_sources = list(
        db.scalars(
            select(Source).where(Source.company_id == company_id, Source.category != "internal")
        ).all()
    )
    blocked_robots_count = sum(
        1
        for s in all_public_sources
        if s.health == "blocked" or "robots" in (s.last_error or "").lower()
    )

    failing_count = 0
    stale_count = 0
    healthy_count = 0
    stale_cutoff = now - timedelta(hours=48)
    for s in approved_sources:
        if s.health in ("error", "blocked"):
            failing_count += 1
        else:
            healthy_count += 1
        if s.last_checked is None:
            stale_count += 1
        else:
            lc = s.last_checked if s.last_checked.tzinfo else s.last_checked.replace(tzinfo=timezone.utc)
            if lc < stale_cutoff:
                stale_count += 1

    healthy_pct = (
        round((healthy_count / len(approved_sources)) * 100)
        if approved_sources
        else 0
    )

    last_run_data = _parse_job_json(last_run.detail) if last_run else {}
    last_per_source = {
        int(row["sourceId"]): row
        for row in (last_run_data.get("perSource") or [])
        if row.get("sourceId") is not None
    }
    crawled_records_by_source: dict[int, int] = {}
    for rec_sid, cnt in db.execute(
        select(Record.source_id, func.count(Record.id))
        .where(Record.company_id == company_id, Record.source_id.is_not(None))
        .group_by(Record.source_id)
    ).all():
        if rec_sid is not None:
            crawled_records_by_source[int(rec_sid)] = int(cnt)

    internal_docs = documents.list_documents(db, company)
    internal_analysed = sum(1 for d in internal_docs if d.get("analysed"))
    internal_signals = sum(
        sum((d.get("insights") or {}).get("counts", {}).values()) for d in internal_docs
    )

    coverage = []
    all_time_coverage = []
    for cat in ("customers", "competitors", "market", "internal"):
        if cat == "internal":
            entry = {
                "category": "internal",
                "approved": len(internal_docs),
                "checked": internal_analysed,
                "newItems": internal_signals,
            }
            coverage.append(entry)
            all_time_coverage.append(dict(entry))
            continue
        cat_sources = [s for s in approved_sources if s.category == cat]
        checked_last = sum(1 for s in cat_sources if s.id in last_per_source)
        new_last = sum(
            int(last_per_source[s.id].get("itemsNew", 0))
            + int(last_per_source[s.id].get("itemsChanged", 0))
            for s in cat_sources
            if s.id in last_per_source
        )
        checked_all = sum(1 for s in cat_sources if s.last_checked is not None)
        new_all = sum(crawled_records_by_source.get(s.id, 0) for s in cat_sources)
        coverage.append(
            {
                "category": cat,
                "approved": len(cat_sources),
                "checked": checked_last,
                "newItems": new_last,
            }
        )
        all_time_coverage.append(
            {
                "category": cat,
                "approved": len(cat_sources),
                "checked": checked_all,
                "newItems": new_all,
            }
        )

    def _recheck_sort_key(s: Source):
        is_err = 0 if s.health in ("error", "blocked") else 1
        ts = s.last_checked.timestamp() if s.last_checked else 0.0
        return (is_err, ts, s.id)

    quick_recheck = [
        {
            "sourceId": str(s.id),
            "name": s.name,
            "domain": _domain_of(s.url),
            "lastCheckedAt": s.last_checked.isoformat() if s.last_checked else None,
            "status": "blocked" if s.health == "blocked" else ("failing" if s.health == "error" else "ok"),
        }
        for s in sorted(approved_sources, key=_recheck_sort_key)[:6]
    ]

    profile_meta = (company.profile or {}).get("_meta") or {}
    crawler_cfg = profile_meta.get("crawler_settings") or {}
    max_pages_limit = crawler_cfg.get("maxPagesPerRun") or max(10, len(approved_sources) * 8)
    pages_used = 0
    budget_run = active_run or last_run
    if budget_run:
        b_data = _parse_job_json(budget_run.detail)
        bc = b_data.get("counts") or {}
        pages_used = (
            int(bc.get("new", 0))
            + int(bc.get("changed", 0))
            + int(bc.get("unchanged", 0))
            + int(b_data.get("sourcesDone", 0))
        )

    return {
        "range": range_key,
        "totals": {
            "new": cur_totals["new"],
            "changed": cur_totals["changed"],
            "failed": cur_totals["failed"],
            "deltaPct": {
                "new": _compute_delta_pct(cur_totals["new"], prev_totals["new"]) if has_prev_data else None,
                "changed": _compute_delta_pct(cur_totals["changed"], prev_totals["changed"]) if has_prev_data else None,
                "failed": _compute_delta_pct(cur_totals["failed"], prev_totals["failed"]) if has_prev_data else None,
            },
        },
        "daily": [daily_map[k] for k in sorted(daily_map.keys())],
        "activeRun": _serialize_crawl_run(active_run, include_per_source=True) if active_run else None,
        "lastRun": _serialize_crawl_run(last_run, include_per_source=True) if last_run else None,
        "recentRuns": [_serialize_crawl_run(r, include_per_source=True) for r in runs[:10]],
        "runsCount": len(runs),
        "nextRunAt": profile_meta.get("next_run_at"),
        "budget": {
            "pagesUsed": pages_used,
            "pagesLimit": int(max_pages_limit),
            "period": "run",
        },
        "etiquette": {
            "respectsRobots": True,
            "delaySeconds": round(1.0 / max(1, settings.fetch_requests_per_second), 2),
            "userAgent": settings.user_agent,
            "blockedByRobots": blocked_robots_count,
        },
        "health": {
            "healthyPct": healthy_pct,
            "failing": failing_count,
            "stale": stale_count,
            "windowCrawls": 5,
        },
        "coverage": coverage,
        "allTimeCoverage": all_time_coverage,
        "quickRecheck": quick_recheck,
    }


def _crawl_run_worker(company_id: int, run_id: int, source_ids: list[int] | None) -> None:
    from datetime import datetime, timezone
    import json as _json
    import crawler
    import db as db_mod

    session = db_mod.SessionLocal()
    try:
        company = session.get(Company, company_id)
        if company is None:
            return
        crawler.crawl_company_run(session, company, run_id, source_ids=source_ids)
    except Exception as exc:
        session.rollback()
        run = session.get(JobLog, run_id)
        if run is not None:
            run.status = "failed"
            data = _parse_job_json(run.detail)
            data["finishedAt"] = datetime.now(timezone.utc).isoformat()
            run.detail = _json.dumps(data, default=str)
            session.commit()
            crawler.append_crawl_log(session, company_id, run_id, "error", f"Crawl aborted: {exc}")
    finally:
        session.close()


@router.post("/companies/{company_id}/crawler/run", status_code=202, tags=["crawler"])
def start_crawler_run(
    company_id: int,
    payload: CrawlRunStartIn | None = None,
    db: Session = Depends(get_db),
) -> dict:
    from datetime import datetime, timezone
    import json as _json
    import threading

    get_company_or_404(db, company_id)
    existing_active = db.scalar(
        select(JobLog)
        .where(
            JobLog.company_id == company_id,
            JobLog.job == "crawl_run",
            JobLog.status.in_(["queued", "running"]),
        )
        .order_by(JobLog.id.desc())
        .limit(1)
    )
    if existing_active is not None:
        return _serialize_crawl_run(existing_active, include_per_source=True)

    source_ids = payload.sourceIds if payload and payload.sourceIds else None
    src_query = select(func.count(Source.id)).where(
        Source.company_id == company_id,
        Source.status == "approved",
        Source.category != "internal",
    )
    if source_ids:
        src_query = src_query.where(Source.id.in_(source_ids))
    sources_total = db.scalar(src_query) or 0

    now_iso = datetime.now(timezone.utc).isoformat()
    run = JobLog(
        company_id=company_id,
        job="crawl_run",
        status="queued",
        detail=_json.dumps(
            {
                "trigger": "manual",
                "startedAt": now_iso,
                "sourcesTotal": sources_total,
                "sourcesDone": 0,
                "sourceIds": source_ids,
                "counts": {"new": 0, "changed": 0, "unchanged": 0, "failed": 0, "blocked": 0},
                "perSource": [],
                "cancelRequested": False,
            }
        ),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    worker = threading.Thread(
        target=_crawl_run_worker,
        args=(company_id, run.id, source_ids),
        daemon=True,
    )
    worker.start()
    return _serialize_crawl_run(run, include_per_source=True)


@router.post("/companies/{company_id}/crawler/runs/{run_id}/cancel", tags=["crawler"])
def cancel_crawler_run(company_id: int, run_id: int, db: Session = Depends(get_db)) -> dict:
    from datetime import datetime, timezone
    import json as _json

    get_company_or_404(db, company_id)
    run = db.get(JobLog, run_id)
    if run is None or run.company_id != company_id or run.job != "crawl_run":
        raise HTTPException(status_code=404, detail=f"crawl run {run_id} not found")
    data = _parse_job_json(run.detail)
    data["cancelRequested"] = True
    if run.status == "queued":
        run.status = "cancelled"
        data["finishedAt"] = datetime.now(timezone.utc).isoformat()
    run.detail = _json.dumps(data, default=str)
    db.commit()
    db.refresh(run)
    return _serialize_crawl_run(run, include_per_source=True)


@router.get("/companies/{company_id}/crawler/runs", tags=["crawler"])
def list_crawler_runs(
    company_id: int,
    cursor: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    range_key: str | None = Query(default=None, alias="range", pattern="^(7d|30d|90d)$"),
    db: Session = Depends(get_db),
) -> dict:
    from datetime import datetime, timedelta, timezone

    get_company_or_404(db, company_id)
    query = select(JobLog).where(JobLog.company_id == company_id, JobLog.job == "crawl_run")
    if range_key:
        cutoff = datetime.now(timezone.utc) - timedelta(days=_range_days(range_key))
        query = query.where(JobLog.at >= cutoff)
    if cursor is not None:
        query = query.where(JobLog.id < cursor)
    rows = list(db.scalars(query.order_by(JobLog.id.desc()).limit(limit + 1)).all())
    has_more = len(rows) > limit
    page = rows[:limit]
    total = (
        db.scalar(
            select(func.count(JobLog.id)).where(
                JobLog.company_id == company_id, JobLog.job == "crawl_run"
            )
        )
        or 0
    )
    return {
        "items": [_serialize_crawl_run(r, include_per_source=True) for r in page],
        "nextCursor": str(page[-1].id) if has_more and page else None,
        "total": total,
    }


@router.get("/companies/{company_id}/crawler/runs/{run_id}", tags=["crawler"])
def get_crawler_run(company_id: int, run_id: int, db: Session = Depends(get_db)) -> dict:
    get_company_or_404(db, company_id)
    run = db.get(JobLog, run_id)
    if run is None or run.company_id != company_id or run.job != "crawl_run":
        raise HTTPException(status_code=404, detail=f"crawl run {run_id} not found")
    data = _parse_job_json(run.detail)
    return {
        "run": _serialize_crawl_run(run, include_per_source=True),
        "results": list(data.get("perSource") or []),
    }


@router.get("/companies/{company_id}/crawler/runs/{run_id}/logs", tags=["crawler"])
def get_crawler_run_logs(
    company_id: int,
    run_id: int,
    cursor: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> dict:
    get_company_or_404(db, company_id)
    run = db.get(JobLog, run_id)
    if run is None or run.company_id != company_id or run.job != "crawl_run":
        raise HTTPException(status_code=404, detail=f"crawl run {run_id} not found")
    query = select(JobLog).where(
        JobLog.company_id == company_id,
        JobLog.job == f"crawl_log:{run_id}",
    )
    if cursor is not None:
        query = query.where(JobLog.id > cursor)
    rows = list(db.scalars(query.order_by(JobLog.id.asc()).limit(limit + 1)).all())
    has_more = len(rows) > limit
    page = rows[:limit]
    return {
        "items": [_serialize_log_line(line) for line in page],
        "nextCursor": str(page[-1].id) if has_more and page else None,
    }


@router.get("/companies/{company_id}/crawler/runs/{run_id}/logs/stream", tags=["crawler"])
def stream_crawler_run_logs(
    company_id: int,
    run_id: int,
    request: Request,
    afterId: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    import json as _json
    import time as _time
    import db as db_mod

    get_company_or_404(db, company_id)
    run = db.get(JobLog, run_id)
    if run is None or run.company_id != company_id or run.job != "crawl_run":
        raise HTTPException(status_code=404, detail=f"crawl run {run_id} not found")

    last_id_hdr = request.headers.get("last-event-id")
    start_after = int(last_id_hdr) if (last_id_hdr and last_id_hdr.isdigit()) else afterId

    def event_stream():
        cursor_id = start_after
        ticks = 0
        max_ticks = 300
        while ticks < max_ticks:
            with db_mod.SessionLocal() as s:
                rows = list(
                    s.scalars(
                        select(JobLog)
                        .where(
                            JobLog.company_id == company_id,
                            JobLog.job == f"crawl_log:{run_id}",
                            JobLog.id > cursor_id,
                        )
                        .order_by(JobLog.id.asc())
                        .limit(100)
                    ).all()
                )
                for row in rows:
                    cursor_id = row.id
                    payload = _json.dumps(_serialize_log_line(row))
                    yield f"id: {row.id}\nevent: log\ndata: {payload}\n\n"

                run_row = s.get(JobLog, run_id)
                if run_row is None or run_row.status not in ("queued", "running"):
                    done_payload = _json.dumps({"status": run_row.status if run_row else "unknown"})
                    yield f"event: done\ndata: {done_payload}\n\n"
                    return
            ticks += 1
            if ticks % 15 == 0:
                yield ": keepalive\n\n"
            _time.sleep(0.35)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _parse_filter_date(raw: str | None, *, end_of_day: bool = False):
    from datetime import datetime, timezone
    import re

    value = (raw or "").strip()
    if not value:
        return None

    date_only = False
    dt: datetime | None = None

    # Support dd-mm-yyyy and dd/mm/yyyy in addition to ISO-8601 (YYYY-MM-DD or full timestamp)
    dmy_match = re.fullmatch(r"(\d{2})[-/](\d{2})[-/](\d{4})", value)
    if dmy_match:
        day, month, year = int(dmy_match.group(1)), int(dmy_match.group(2)), int(dmy_match.group(3))
        try:
            dt = datetime(year, month, day, tzinfo=timezone.utc)
            date_only = True
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"invalid date filter: {raw}") from exc
    else:
        iso_val = value[:-1] + "+00:00" if value.endswith("Z") else value
        try:
            dt = datetime.fromisoformat(iso_val)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"invalid date filter: {raw}") from exc
        date_only = len(value) == 10 and "T" not in value and " " not in value
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)

    if end_of_day and date_only:
        dt = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
    return dt


@router.get("/companies/{company_id}/crawler/items", tags=["crawler"])
def list_crawler_items(
    company_id: int,
    category: str | None = Query(default=None),
    change: str | None = Query(default=None),
    sourceId: int | None = Query(default=None),
    q: str | None = Query(default=None),
    dateFrom: str | None = Query(default=None),
    dateTo: str | None = Query(default=None),
    cursor: int | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict:
    from datetime import timezone

    get_company_or_404(db, company_id)
    query = (
        select(Record, Source)
        .outerjoin(Source, Record.source_id == Source.id)
        .where(
            Record.company_id == company_id,
            (Source.category.is_(None)) | (func.lower(Source.category) != "internal"),
        )
        .order_by(Record.discovered.desc(), Record.id.desc())
    )
    rows = db.execute(query).all()
    from_dt = _parse_filter_date(dateFrom, end_of_day=False)
    to_dt = _parse_filter_date(dateTo, end_of_day=True)
    cat_filter = (category or "").strip().lower()
    if cat_filter == "all":
        cat_filter = ""
    change_filter = (change or "").strip().lower()
    if change_filter == "all":
        change_filter = ""
    needle = (q or "").strip().lower()

    filtered: list[tuple[Record, Source | None]] = []
    for rec, src in rows:
        cat = (src.category or "market").strip().lower() if src else "market"
        ch = "changed" if rec.is_update else "new"
        if cat_filter and cat != cat_filter:
            continue
        if change_filter and ch != change_filter:
            continue
        if sourceId is not None and rec.source_id != sourceId:
            continue
        if from_dt and rec.discovered:
            disc = rec.discovered if rec.discovered.tzinfo else rec.discovered.replace(tzinfo=timezone.utc)
            if disc < from_dt:
                continue
        if to_dt and rec.discovered:
            disc = rec.discovered if rec.discovered.tzinfo else rec.discovered.replace(tzinfo=timezone.utc)
            if disc > to_dt:
                continue
        if needle:
            hay = f"{rec.title} {rec.url} {rec.text[:600]}".lower()
            if needle not in hay:
                continue
        filtered.append((rec, src))

    total = len(filtered)
    if cursor is not None:
        cursor_idx = next((idx for idx, (rec, _src) in enumerate(filtered) if rec.id == cursor), None)
        if cursor_idx is not None:
            filtered = filtered[cursor_idx + 1 :]
        else:
            filtered = [pair for pair in filtered if pair[0].id < cursor]
    page = filtered[:limit]
    has_more = len(filtered) > limit
    return {
        "items": [_serialize_collected_item(rec, src) for rec, src in page],
        "nextCursor": str(page[-1][0].id) if has_more and page else None,
        "total": total,
    }


@router.get("/companies/{company_id}/crawler/items/{item_id}", tags=["crawler"])
def get_crawler_item(company_id: int, item_id: int, db: Session = Depends(get_db)) -> dict:
    from research import normalise_url

    get_company_or_404(db, company_id)
    record = db.get(Record, item_id)
    if record is None or record.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"item {item_id} not found")
    source = db.get(Source, record.source_id) if record.source_id else None

    diff: dict | None = None
    if record.is_update:
        target_key = normalise_url(record.url)
        prior_rows = list(
            db.scalars(
                select(Record)
                .where(Record.company_id == company_id, Record.id < record.id)
                .order_by(Record.id.desc())
            ).all()
        )
        prev = next((r for r in prior_rows if normalise_url(r.url) == target_key), None)
        if prev is not None:
            diff = {"before": (prev.text or "")[:500], "after": (record.text or "")[:500]}

    return _serialize_collected_item(record, source, excerpt_len=1000, diff=diff)


@router.get("/companies/{company_id}/crawler/logs/export", tags=["crawler"])
def export_crawler_logs_csv(
    company_id: int,
    range_key: str = Query(default="7d", alias="range", pattern="^(7d|30d|90d)$"),
    db: Session = Depends(get_db),
) -> Response:
    import csv
    import io
    from datetime import datetime, timedelta, timezone

    get_company_or_404(db, company_id)
    cutoff = datetime.now(timezone.utc) - timedelta(days=_range_days(range_key))
    lines = list(
        db.scalars(
            select(JobLog)
            .where(
                JobLog.company_id == company_id,
                JobLog.job.like("crawl_log:%"),
                JobLog.at >= cutoff,
            )
            .order_by(JobLog.id.asc())
        ).all()
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "run_id", "timestamp", "level", "source_domain", "message"])
    for ln in lines:
        item = _serialize_log_line(ln)
        writer.writerow(
            [
                item["id"],
                item["runId"],
                item["ts"] or "",
                item["level"],
                item["sourceDomain"] or "",
                item["message"],
            ]
        )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="crawler-logs-company-{company_id}-{range_key}.csv"'
        },
    )


@router.patch("/companies/{company_id}/crawler/settings", tags=["crawler"])
def patch_crawler_settings(
    company_id: int,
    payload: CrawlerSettingsPatchIn,
    db: Session = Depends(get_db),
) -> dict:
    company = get_company_or_404(db, company_id)
    profile = dict(company.profile or {})
    meta = dict(profile.get("_meta") or {})
    cfg = dict(meta.get("crawler_settings") or {})
    if payload.maxPagesPerRun is not None:
        cfg["maxPagesPerRun"] = payload.maxPagesPerRun
    meta["crawler_settings"] = cfg
    profile["_meta"] = meta
    company.profile = profile
    db.commit()
    return {"maxPagesPerRun": cfg.get("maxPagesPerRun")}


# --------------------------------------------------------------------------- #
# Intelligence Feed / Signals (Step 5)
# --------------------------------------------------------------------------- #
def _signal_range_days(range_key: str) -> int | None:
    return {"week": 7, "30d": 30, "90d": 90, "all": None}.get(range_key, 30)


def _map_classification(raw: str | None) -> str:
    if raw in ("opportunity", "threat", "neutral"):
        return raw
    return "neutral"


def _map_category(source: Source | None, analysis: dict) -> str:
    cat = (source.category if source else None) or analysis.get("category") or "market"
    if cat in ("customers", "competitors", "market", "internal"):
        return cat
    return "market"


def _priority_level(total: float) -> int:
    if total >= 80:
        return 5
    if total >= 65:
        return 4
    if total >= 45:
        return 3
    if total >= 25:
        return 2
    return 1


def _serialize_signal(
    company: Company,
    record: Record,
    source: Source | None,
    *,
    related_ids: list[int] | None = None,
) -> dict:
    analysis = record.analysis or {}
    scores = record.scores or {}
    profile = company.profile or {}
    meta = profile.get("_meta") or {}
    states = meta.get("signal_states") or {}
    feedback_map = meta.get("signal_feedback") or {}

    classification = _map_classification(analysis.get("classification"))
    category = _map_category(source, analysis)
    domain = _domain_of(source.url if source else record.url)
    clean_title = (analysis.get("title") or record.title or record.url).strip()
    if clean_title.startswith("[UPDATED] "):
        clean_title = clean_title[len("[UPDATED] "):]

    total_val = float(record.total or analysis.get("total") or 0.0)
    priority_value = max(0, min(100, int(round(total_val))))
    priority = _priority_level(total_val)

    impact_num = float(analysis.get("impact") or 0.0)
    impact_level = "high" if impact_num >= 0.7 else ("medium" if impact_num >= 0.4 else "low")

    verbatim = analysis.get("evidence_verbatim") is True
    ev_strength = float(analysis.get("evidence_strength") or 0.0)
    confidence = "high" if (verbatim and ev_strength >= 0.7) else ("medium" if (verbatim or ev_strength >= 0.4) else "low")

    weights = scores.get("weights") or {}
    priority_reasons: list[dict] = []
    for key, label in (
        ("relevance", "Strategic relevance"),
        ("impact", "Business impact"),
        ("urgency", "Time urgency"),
        ("credibility", "Source credibility"),
        ("recency", "Recency"),
    ):
        val = scores.get(key)
        if val is not None:
            priority_reasons.append({"label": label, "weight": int(round(float(val) * 100))})
    if not priority_reasons:
        priority_reasons = [
            {"label": "Relevance", "weight": int(round(float(analysis.get("relevance") or 0.5) * 100))},
            {"label": "Impact", "weight": int(round(impact_num * 100))},
            {"label": "Urgency", "weight": int(round(float(analysis.get("urgency") or 0.5) * 100))},
        ]

    # Ground assumption refs in real founder interview answers or company profile facts
    assumption_refs: list[dict] = []
    intel = profile.get("intelligence") or {}
    founder_answers = intel.get("founder_answers") or []
    for fa in founder_answers[:2]:
        topic = fa.get("topic") or "Founder answer"
        idx = fa.get("index", 0)
        assumption_refs.append(
            {
                "type": "interview",
                "id": str(idx),
                "label": f"Interview: {topic}",
            }
        )
    if profile.get("industry"):
        assumption_refs.append(
            {
                "type": "profile",
                "id": "industry",
                "label": f"Profile: {profile.get('industry')}",
            }
        )

    why_it_matters = (analysis.get("why_it_matters") or analysis.get("summary") or "").strip()
    rec_text = (analysis.get("recommended_action") or "").strip()
    if not rec_text:
        if classification == "opportunity":
            rec_text = f"Evaluate how {company.name} can act on this signal: {analysis.get('summary') or clean_title}"
        elif classification == "threat":
            rec_text = f"Review risk and prepare response to: {analysis.get('summary') or clean_title}"
        else:
            rec_text = f"Monitor development from {domain}: {analysis.get('summary') or clean_title}"

    fb_entry = feedback_map.get(str(record.id))
    fb_val = fb_entry.get("feedback") if isinstance(fb_entry, dict) else fb_entry

    status_val = states.get(str(record.id), "new")
    if status_val not in ("new", "saved", "in_brief", "dismissed"):
        status_val = "new"

    ev_snippet = (analysis.get("evidence_snippet") or record.text or "")[:320]

    return {
        "id": record.id,
        "companyId": company.id,
        "category": category,
        "classification": classification,
        "headline": clean_title,
        "evidenceSummary": ev_snippet,
        "whyItMatters": why_it_matters,
        "potentialImpact": (
            f"{impact_level.capitalize()} business impact ({int(round(impact_num * 100))}/100)"
        ),
        "impactLevel": impact_level,
        "recommendedAction": {
            "text": rec_text,
            "effort": analysis.get("effort"),
            "timeframe": analysis.get("timeframe"),
        },
        "priority": priority,
        "priorityValue": priority_value,
        "priorityReasons": priority_reasons,
        "confidence": confidence,
        "evidenceIds": [str(record.id)],
        "itemIds": [str(record.id)],
        "sourceDomains": [domain],
        "assumptionRefs": assumption_refs,
        "limitations": (
            analysis.get("limitations")
            or analysis.get("flag")
            or ("Single-source signal; no corroboration yet." if not related_ids else None)
        ),
        "publishedAt": record.published.isoformat() if record.published else None,
        "detectedAt": (
            analysis.get("analysed_at")
            or (record.discovered.isoformat() if record.discovered else None)
        ),
        "status": status_val,
        "feedback": fb_val if fb_val in ("useful", "not_useful") else None,
        "relatedSignalIds": [str(rid) for rid in (related_ids or [])],
        "verified": verbatim,
        "sourceName": source.name if source else domain,
        "sourceId": record.source_id,
    }


def _analysed_rows(db: Session, company_id: int) -> list[tuple[Record, Source | None]]:
    return list(
        db.execute(
            select(Record, Source)
            .outerjoin(Source, Record.source_id == Source.id)
            .where(Record.company_id == company_id, Record.analysis.is_not(None))
            .order_by(Record.total.desc(), Record.id.desc())
        ).all()
    )


@router.get("/companies/{company_id}/signals/overview", tags=["signals"])
def get_signals_overview(
    company_id: int,
    range_key: str = Query(default="30d", alias="range", pattern="^(week|30d|90d|all)$"),
    db: Session = Depends(get_db),
) -> dict:
    from datetime import datetime, timedelta, timezone

    company = get_company_or_404(db, company_id)
    now = datetime.now(timezone.utc)
    days = _signal_range_days(range_key)
    rows = _analysed_rows(db, company_id)
    rel_map = _related_records_map(rows)

    all_signals = [
        _serialize_signal(
            company,
            rec,
            src,
            related_ids=[r["id"] for r in rel_map.get(rec.id, [])],
        )
        for rec, src in rows
    ]

    def _rec_dt(sig: dict) -> datetime | None:
        raw = sig.get("detectedAt")
        if not raw:
            return None
        try:
            dt = datetime.fromisoformat(raw)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None

    if days is not None:
        cutoff = now - timedelta(days=days)
        prev_cutoff = cutoff - timedelta(days=days)
        in_range = [s for s in all_signals if (_rec_dt(s) or now) >= cutoff]
        prev_range = [
            s
            for s in all_signals
            if (_rec_dt(s) or now) >= prev_cutoff and (_rec_dt(s) or now) < cutoff
        ]
    else:
        in_range = all_signals
        prev_range = []

    opp_list = [s for s in in_range if s["classification"] == "opportunity"]
    threat_list = [s for s in in_range if s["classification"] == "threat"]
    needs_att = [s for s in in_range if s["priority"] >= 4 and s["status"] == "new"]
    verified_cnt = sum(1 for s in in_range if s["verified"])
    evidence_cov = round((verified_cnt / len(in_range)) * 100) if in_range else 100

    prev_has_data = len(prev_range) > 0
    prev_opp = sum(1 for s in prev_range if s["classification"] == "opportunity")
    prev_threat = sum(1 for s in prev_range if s["classification"] == "threat")
    prev_att = sum(1 for s in prev_range if s["priority"] >= 4 and s["status"] == "new")

    # Daily chart buckets
    bucket_days = days if days is not None else 30
    start_date = now.date() - timedelta(days=bucket_days - 1)
    daily_map: dict[str, dict] = {}
    for i in range(bucket_days):
        d_str = (start_date + timedelta(days=i)).isoformat()
        daily_map[d_str] = {
            "date": d_str,
            "opportunities": 0,
            "threats": 0,
            "neutral": 0,
            "topHeadline": None,
            "_topPriority": -1,
        }

    for s in in_range:
        dt = _rec_dt(s)
        if not dt:
            continue
        key = dt.date().isoformat()
        if key not in daily_map:
            continue
        bucket = daily_map[key]
        if s["classification"] == "opportunity":
            bucket["opportunities"] += 1
        elif s["classification"] == "threat":
            bucket["threats"] += 1
        else:
            bucket["neutral"] += 1
        if s["priorityValue"] > bucket["_topPriority"]:
            bucket["_topPriority"] = s["priorityValue"]
            bucket["topHeadline"] = s["headline"]

    daily = [
        {
            "date": b["date"],
            "opportunities": b["opportunities"],
            "threats": b["threats"],
            "neutral": b["neutral"],
            "topHeadline": b["topHeadline"],
        }
        for b in [daily_map[k] for k in sorted(daily_map.keys())]
    ]

    non_dismissed = [s for s in in_range if s["status"] != "dismissed"]
    top_signals = sorted(non_dismissed, key=lambda s: -s["priorityValue"])[:5]
    top_opps = sorted(opp_list, key=lambda s: -s["priorityValue"])[:3]
    top_threats = sorted(threat_list, key=lambda s: -s["priorityValue"])[:3]

    by_category = [
        {
            "category": cat,
            "count": sum(1 for s in in_range if s["category"] == cat),
        }
        for cat in ("customers", "competitors", "market", "internal")
    ]

    avg_priority = (
        round(sum(s["priority"] for s in in_range) / len(in_range), 1)
        if in_range
        else 0.0
    )
    conf_scores = {"high": 3, "medium": 2, "low": 1}
    avg_conf_num = (
        sum(conf_scores.get(s["confidence"], 1) for s in in_range) / len(in_range)
        if in_range
        else 0.0
    )
    avg_confidence = (
        "High" if avg_conf_num >= 2.5 else ("Medium" if avg_conf_num >= 1.6 else ("Low" if in_range else "—"))
    )
    sources_used = len({s.get("sourceId") for s in in_range if s.get("sourceId")})
    awaiting_review = sum(1 for s in in_range if s["status"] == "new")

    # Latest real collected evidence (not AI text)
    ev_rows = db.execute(
        select(Record, Source)
        .outerjoin(Source, Record.source_id == Source.id)
        .where(
            Record.company_id == company_id,
            (Source.category.is_(None)) | (Source.category != "internal"),
        )
        .order_by(Record.id.desc())
        .limit(5)
    ).all()
    latest_evidence = [_serialize_collected_item(rec, src) for rec, src in ev_rows]

    # Real watchlist from latest report if any
    latest_report = db.scalar(
        select(Report).where(Report.company_id == company_id).order_by(Report.id.desc()).limit(1)
    )
    watchlist: list[dict] = []
    if latest_report and isinstance(latest_report.content, dict):
        risks = latest_report.content.get("risks") or []
        for rk in risks[:4]:
            if isinstance(rk, dict) and rk.get("risk"):
                watchlist.append(
                    {
                        "title": rk["risk"][:120],
                        "domain": company.website,
                        "expectedAt": None,
                    }
                )

    unanalysed_items = (
        db.scalar(
            select(func.count(Record.id)).where(
                Record.company_id == company_id, Record.analysis.is_(None)
            )
        )
        or 0
    )

    latest_job = db.scalar(
        select(JobLog)
        .where(JobLog.company_id == company_id, JobLog.job == "job:analyse")
        .order_by(JobLog.id.desc())
        .limit(1)
    )
    analysis_status = "idle"
    analysis_error: str | None = None
    if latest_job:
        if latest_job.status == "running":
            analysis_status = "running"
        elif latest_job.status == "error":
            parsed = _parse_job_json(latest_job.detail)
            # Only report failed if no signals exist or latest job just errored after last signal
            analysis_status = "failed"
            analysis_error = parsed.get("error") or latest_job.detail

    analysis_steps = (
        [
            {"label": f"Reading {unanalysed_items} new item(s)", "status": "running" if analysis_status == "running" else "done"},
            {"label": "Classifying", "status": "pending" if analysis_status == "running" else "done"},
            {"label": "Scoring priority", "status": "pending" if analysis_status == "running" else "done"},
            {"label": "Writing recommendations", "status": "pending" if analysis_status == "running" else "done"},
        ]
        if analysis_status == "running"
        else []
    )

    last_analysed_at = max(
        (s["detectedAt"] for s in all_signals if s.get("detectedAt")),
        default=None,
    )

    suggested_questions: list[str] = []
    if top_threats:
        suggested_questions.append("Which threats should we address first this week?")
    if top_opps:
        suggested_questions.append("What are our highest-priority growth opportunities?")
    if any(s["category"] == "competitors" for s in in_range):
        suggested_questions.append("Which competitor changes matter most right now?")

    return {
        "range": range_key,
        "kpis": {
            "newSignals": len(in_range),
            "opportunities": len(opp_list),
            "threats": len(threat_list),
            "needsAttention": len(needs_att),
            "evidenceCoveragePct": evidence_cov,
            "highPriorityOpportunities": sum(1 for s in opp_list if s["priority"] >= 4),
            "highPriorityThreats": sum(1 for s in threat_list if s["priority"] >= 4),
            "deltaPct": {
                "newSignals": _compute_delta_pct(len(in_range), len(prev_range)) if prev_has_data else None,
                "opportunities": _compute_delta_pct(len(opp_list), prev_opp) if prev_has_data else None,
                "threats": _compute_delta_pct(len(threat_list), prev_threat) if prev_has_data else None,
                "needsAttention": _compute_delta_pct(len(needs_att), prev_att) if prev_has_data else None,
            },
        },
        "daily": daily,
        "previousPeriodTotal": len(prev_range),
        "avgPriority": avg_priority,
        "verifiedPct": evidence_cov,
        "topSignals": top_signals,
        "topOpportunities": top_opps,
        "topThreats": top_threats,
        "byCategory": by_category,
        "avgConfidence": avg_confidence,
        "sourcesUsed": sources_used,
        "awaitingReview": awaiting_review,
        "inBriefCount": sum(1 for s in all_signals if s["status"] == "in_brief"),
        "latestEvidence": latest_evidence,
        "watchlist": watchlist,
        "analysisStatus": analysis_status,
        "analysisError": analysis_error,
        "analysisSteps": analysis_steps,
        "unanalysedItems": unanalysed_items,
        "lastAnalysedAt": last_analysed_at,
        "suggestedQuestions": suggested_questions,
        "countsByStatus": {
            "all": len(all_signals),
            "new": sum(1 for s in all_signals if s["status"] == "new"),
            "saved": sum(1 for s in all_signals if s["status"] == "saved"),
            "in_brief": sum(1 for s in all_signals if s["status"] == "in_brief"),
            "dismissed": sum(1 for s in all_signals if s["status"] == "dismissed"),
            "opportunities": sum(1 for s in all_signals if s["classification"] == "opportunity" and s["status"] != "dismissed"),
            "threats": sum(1 for s in all_signals if s["classification"] == "threat" and s["status"] != "dismissed"),
        },
    }


@router.get("/companies/{company_id}/signals", tags=["signals"])
def list_company_signals(
    company_id: int,
    category: str | None = Query(default=None),
    classification: str | None = Query(default=None),
    minPriority: int | None = Query(default=None, ge=1, le=5),
    sourceId: int | None = Query(default=None),
    status: str | None = Query(default=None),
    dateFrom: str | None = Query(default=None),
    dateTo: str | None = Query(default=None),
    q: str | None = Query(default=None),
    sort: str = Query(default="priority", pattern="^(priority|newest|confidence)$"),
    cursor: int | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict:
    from datetime import datetime, timezone

    company = get_company_or_404(db, company_id)
    rows = _analysed_rows(db, company_id)
    rel_map = _related_records_map(rows)

    rec_by_id: dict[int, tuple[Record, Source | None]] = {rec.id: (rec, src) for rec, src in rows}
    all_signals = [
        _serialize_signal(
            company,
            rec,
            src,
            related_ids=[r["id"] for r in rel_map.get(rec.id, [])],
        )
        for rec, src in rows
    ]

    cat_filters = {c.strip() for c in category.split(",")} if category else set()
    needle = (q or "").strip().lower()
    from_dt = datetime.fromisoformat(dateFrom).replace(tzinfo=timezone.utc) if dateFrom else None
    to_dt = (
        datetime.fromisoformat(dateTo).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
        if dateTo
        else None
    )

    filtered: list[dict] = []
    for sig in all_signals:
        if cat_filters and sig["category"] not in cat_filters:
            continue
        if classification and classification != "all" and sig["classification"] != classification:
            continue
        if minPriority is not None and sig["priority"] < minPriority:
            continue
        if sourceId is not None and sig.get("sourceId") != sourceId:
            continue
        if status and status != "all":
            if sig["status"] != status:
                continue
        elif not status:
            # Default feed hides dismissed unless explicitly queried
            if sig["status"] == "dismissed":
                continue

        if from_dt or to_dt:
            raw_dt = sig.get("detectedAt")
            if raw_dt:
                dt = datetime.fromisoformat(raw_dt)
                dt = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
                if from_dt and dt < from_dt:
                    continue
                if to_dt and dt > to_dt:
                    continue

        if needle:
            hay = f"{sig['headline']} {sig['evidenceSummary']} {sig['whyItMatters']} {sig['recommendedAction']['text']}".lower()
            if needle not in hay:
                continue
        filtered.append(sig)

    conf_rank = {"high": 3, "medium": 2, "low": 1}
    if sort == "newest":
        filtered.sort(key=lambda s: (s.get("detectedAt") or "", s["id"]), reverse=True)
    elif sort == "confidence":
        filtered.sort(key=lambda s: (conf_rank.get(s["confidence"], 0), s["priorityValue"]), reverse=True)
    else:
        filtered.sort(key=lambda s: (s["priorityValue"], s["id"]), reverse=True)

    total = len(filtered)
    offset = max(0, cursor or 0)
    page = filtered[offset : offset + limit]
    next_cursor = str(offset + limit) if (offset + limit) < total else None

    evidence_by_id: dict[str, dict] = {}
    for sig in page:
        rec, src = rec_by_id[sig["id"]]
        evidence_by_id[str(sig["id"])] = _serialize_collected_item(rec, src, excerpt_len=360)

    return {
        "items": page,
        "evidenceById": evidence_by_id,
        "nextCursor": next_cursor,
        "total": total,
        "countsByClassification": {
            "opportunity": sum(1 for s in filtered if s["classification"] == "opportunity"),
            "threat": sum(1 for s in filtered if s["classification"] == "threat"),
            "neutral": sum(1 for s in filtered if s["classification"] == "neutral"),
        },
        "countsByCategory": {
            cat: sum(1 for s in filtered if s["category"] == cat)
            for cat in ("customers", "competitors", "market", "internal")
        },
    }


@router.get("/companies/{company_id}/signals/{signal_id}", tags=["signals"])
def get_company_signal(company_id: int, signal_id: int, db: Session = Depends(get_db)) -> dict:
    from research import normalise_url

    company = get_company_or_404(db, company_id)
    record = db.get(Record, signal_id)
    if record is None or record.company_id != company_id or record.analysis is None:
        raise HTTPException(status_code=404, detail=f"signal {signal_id} not found")
    source = db.get(Source, record.source_id) if record.source_id else None
    rows = _analysed_rows(db, company_id)
    rel_map = _related_records_map(rows)
    signal = _serialize_signal(
        company,
        record,
        source,
        related_ids=[r["id"] for r in rel_map.get(record.id, [])],
    )

    diff: dict | None = None
    if record.is_update:
        target_key = normalise_url(record.url)
        prior = [
            r
            for r in db.scalars(
                select(Record)
                .where(Record.company_id == company_id, Record.id < record.id)
                .order_by(Record.id.desc())
            ).all()
            if normalise_url(r.url) == target_key
        ]
        if prior:
            diff = {"before": (prior[0].text or "")[:500], "after": (record.text or "")[:500]}

    return {
        "signal": signal,
        "evidenceItems": [_serialize_collected_item(record, source, excerpt_len=1000, diff=diff)],
        "relatedSignals": [
            _serialize_signal(company, r_rec, r_src)
            for r_rec, r_src in rows
            if str(r_rec.id) in signal["relatedSignalIds"]
        ],
    }


@router.patch("/companies/{company_id}/signals/{signal_id}", tags=["signals"])
def patch_company_signal(
    company_id: int,
    signal_id: int,
    payload: SignalPatchIn,
    db: Session = Depends(get_db),
) -> dict:
    company = get_company_or_404(db, company_id)
    record = db.get(Record, signal_id)
    if record is None or record.company_id != company_id or record.analysis is None:
        raise HTTPException(status_code=404, detail=f"signal {signal_id} not found")

    profile = dict(company.profile or {})
    meta = dict(profile.get("_meta") or {})
    states = dict(meta.get("signal_states") or {})
    feedback_map = dict(meta.get("signal_feedback") or {})

    if payload.status is not None:
        states[str(signal_id)] = payload.status
    if payload.feedback is not None:
        feedback_map[str(signal_id)] = {
            "feedback": payload.feedback,
            "comment": payload.feedbackComment or "",
        }

    meta["signal_states"] = states
    meta["signal_feedback"] = feedback_map
    profile["_meta"] = meta
    company.profile = profile
    db.commit()
    db.refresh(company)

    source = db.get(Source, record.source_id) if record.source_id else None
    return _serialize_signal(company, record, source)


@router.post("/companies/{company_id}/signals/bulk", tags=["signals"])
def bulk_update_company_signals(
    company_id: int,
    payload: SignalsBulkIn,
    db: Session = Depends(get_db),
) -> dict:
    company = get_company_or_404(db, company_id)
    profile = dict(company.profile or {})
    meta = dict(profile.get("_meta") or {})
    states = dict(meta.get("signal_states") or {})
    feedback_map = dict(meta.get("signal_feedback") or {})

    valid_ids = set(
        db.scalars(
            select(Record.id).where(
                Record.company_id == company_id,
                Record.analysis.is_not(None),
                Record.id.in_(payload.ids),
            )
        ).all()
    )
    updated_count = 0
    for sid in valid_ids:
        if payload.patch.status is not None:
            states[str(sid)] = payload.patch.status
        if payload.patch.feedback is not None:
            feedback_map[str(sid)] = {
                "feedback": payload.patch.feedback,
                "comment": payload.patch.feedbackComment or "",
            }
        updated_count += 1

    meta["signal_states"] = states
    meta["signal_feedback"] = feedback_map
    profile["_meta"] = meta
    company.profile = profile
    db.commit()
    return {"updatedCount": updated_count}


@router.post("/companies/{company_id}/signals/analyse", status_code=202, tags=["signals"])
def run_signals_analysis(company_id: int, db: Session = Depends(get_db)) -> dict:
    import jobs

    get_company_or_404(db, company_id)
    existing = db.scalar(
        select(JobLog)
        .where(
            JobLog.company_id == company_id,
            JobLog.job == "job:analyse",
            JobLog.status == "running",
        )
        .order_by(JobLog.id.desc())
        .limit(1)
    )
    if existing is not None:
        return {"id": existing.id, "job": "analyse", "status": "running"}
    return jobs.start_company_job(db, company_id, "analyse")


_ASK_GREETINGS = {
    "hi",
    "hello",
    "hey",
    "hey there",
    "hi there",
    "hello there",
    "yo",
    "hola",
    "good morning",
    "good afternoon",
    "good evening",
    "howdy",
    "thanks",
    "thank you",
    "help",
    "what can you do",
    "what can i ask",
    "who are you",
}


def _suggested_questions_for_rows(rows: list[tuple[Record, Source | None]]) -> list[str]:
    suggestions: list[str] = []
    for rec, _src in rows[:3]:
        a = rec.analysis or {}
        title = (a.get("title") or rec.title or "").strip()
        if not title:
            continue
        short = title[:70].rstrip(" .")
        suggestions.append(f"What is the evidence and impact of: {short}?")
    return suggestions


def _build_ask_card_rows(pairs: list[tuple[Record, Source | None]]) -> list[dict]:
    card_rows = []
    for rec, src in pairs:
        a = rec.analysis or {}
        title = (a.get("title") or rec.title)[:90]
        cat = _map_category(src, a)
        card_rows.append(
            {
                "label": title[:54],
                "value": f"P{_priority_level(float(rec.total or 0))} · {(a.get('classification') or 'neutral').title()}",
                "category": cat,
            }
        )
    return card_rows


@router.post("/companies/{company_id}/signals/ask", tags=["signals"])
def ask_company_signals(
    company_id: int,
    payload: SignalsAskIn,
    db: Session = Depends(get_db),
) -> dict:
    import re as _re
    import llm
    from config import get_settings

    company = get_company_or_404(db, company_id)
    settings = get_settings()
    rows = _analysed_rows(db, company_id)

    cleaned_q = " ".join(_re.sub(r"[^a-z0-9\s]", " ", (payload.question or "").lower()).split())
    if cleaned_q in _ASK_GREETINGS and not payload.quotedText:
        suggestions = _suggested_questions_for_rows(rows)
        if not rows:
            return {
                "answer": (
                    f"Hi! I answer questions strictly from {company.name}'s analysed signals. "
                    "There are no analysed signals yet — run Crawl and Analyse Signals first, then ask about competitors, threats, or opportunities."
                ),
                "citations": [],
                "suggestedQuestions": [],
            }
        top_titles = "; ".join(
            ((rec.analysis or {}).get("title") or rec.title)[:60] for rec, _ in rows[:3]
        )
        return {
            "answer": (
                f"Hi! I answer questions strictly using {company.name}'s {len(rows)} analysed signals "
                f"(including: {top_titles}). Ask about any competitor, threat, opportunity, or click a suggested question below."
            ),
            "citations": [],
            "suggestedQuestions": suggestions,
        }

    if not rows:
        return {"answer": "", "citations": [], "suggestedQuestions": []}

    q_text = f"{payload.question} {payload.quotedText or ''}".lower()
    tokens = {tok for tok in _re.findall(r"[a-z0-9]{3,}", q_text) if tok not in _CORROBORATION_STOPWORDS}

    scored_matches: list[tuple[int, Record, Source | None]] = []
    for rec, src in rows:
        a = rec.analysis or {}
        hay = f"{a.get('title') or rec.title} {a.get('summary') or ''} {rec.text[:800]} {src.category if src else ''}".lower()
        overlap = sum(1 for tok in tokens if tok in hay)
        if overlap > 0 or not tokens:
            scored_matches.append((overlap, rec, src))

    if not scored_matches:
        return {"answer": "", "citations": [], "suggestedQuestions": []}

    scored_matches.sort(key=lambda item: (-item[0], -item[1].total))
    top_matches = scored_matches[:5]

    if settings.has_groq_key:
        try:
            evidence_context = "\n\n".join(
                f"[Record {rec.id}] ({src.category if src else 'market'}, {_domain_of(src.url if src else rec.url)}) "
                f"Title: {(rec.analysis or {}).get('title') or rec.title}\n"
                f"Summary: {(rec.analysis or {}).get('summary') or ''}\n"
                f"Verbatim evidence: {(rec.analysis or {}).get('evidence_snippet') or rec.text[:300]}"
                for _, rec, src in top_matches
            )
            prompt = (
                f"You are answering a founder question about {company.name}'s monitored signals.\n"
                f"Question: {payload.question}\n"
                + (f"Quoted context: {payload.quotedText}\n" if payload.quotedText else "")
                + "\nRules:\n"
                "- Answer strictly using ONLY the records below.\n"
                "- Populate cited_record_ids with the exact integer Record IDs you relied on.\n"
                "- Populate answer_card with a concise title and up to 3 supporting rows when evidence supports it, and recommendation with a concrete next step.\n"
                "- If none of the records answer the question, return empty cited_record_ids.\n\n"
                + evidence_context
            )
            llm_out = llm.ask(prompt, SignalsAskLLMOut, max_tokens=700)
            valid_ids = {rec.id for _, rec, _ in top_matches}
            cited = [rid for rid in llm_out.cited_record_ids if rid in valid_ids]
            if not cited:
                return {"answer": "", "citations": [], "suggestedQuestions": llm_out.suggested_questions}
            rec_lookup = {rec.id: (rec, src) for _, rec, src in top_matches}
            citations = [
                {
                    "signalId": str(rid),
                    "evidenceId": str(rid),
                    "label": ((rec_lookup[rid][0].analysis or {}).get("title") or rec_lookup[rid][0].title)[:90],
                }
                for rid in cited
            ]
            fallback_rows = _build_ask_card_rows([rec_lookup[rid] for rid in cited[:3]])
            answer_card = (
                llm_out.answer_card.model_dump()
                if (llm_out.answer_card and llm_out.answer_card.rows)
                else ({"title": "Matched signal breakdown", "rows": fallback_rows} if fallback_rows else None)
            )
            top_rec_action = ((rec_lookup[cited[0]][0].analysis or {}).get("recommended_action") or "").strip()
            recommendation = (llm_out.recommendation or "").strip() or top_rec_action or None
            return {
                "answer": llm_out.answer,
                "citations": citations,
                "suggestedQuestions": llm_out.suggested_questions,
                "answerCard": answer_card,
                "recommendation": recommendation,
            }
        except Exception:
            pass

    # Deterministic grounded fallback using strictly verified stored summaries
    bullets = []
    citations = []
    matched_pairs = [(rec, src) for _, rec, src in top_matches[:3]]
    for rec, src in matched_pairs:
        a = rec.analysis or {}
        title = (a.get("title") or rec.title)[:90]
        summary = (a.get("summary") or rec.text[:220]).strip()
        domain = _domain_of(src.url if src else rec.url)
        bullets.append(f"• {title} ({domain}): {summary}")
        citations.append({"signalId": str(rec.id), "evidenceId": str(rec.id), "label": title})
    card_rows = _build_ask_card_rows(matched_pairs)

    top_rec_action = ((top_matches[0][1].analysis or {}).get("recommended_action") or "").strip()
    return {
        "answer": "Based on the collected signals:\n" + "\n".join(bullets),
        "citations": citations,
        "suggestedQuestions": [],
        "answerCard": {"title": "Matched signal breakdown", "rows": card_rows} if card_rows else None,
        "recommendation": top_rec_action or None,
    }


# --------------------------------------------------------------------------- #
# Main Dashboard & Workspace Search
# --------------------------------------------------------------------------- #
def _next_weekly_monday_0600(now_dt):
    from datetime import timedelta

    days_ahead = (0 - now_dt.weekday()) % 7
    candidate = now_dt.replace(hour=6, minute=0, second=0, microsecond=0) + timedelta(days=days_ahead)
    if candidate <= now_dt:
        candidate += timedelta(days=7)
    return candidate


def _next_monthly_1st_0630(now_dt):
    candidate = now_dt.replace(day=1, hour=6, minute=30, second=0, microsecond=0)
    if candidate <= now_dt:
        if candidate.month == 12:
            candidate = candidate.replace(year=candidate.year + 1, month=1)
        else:
            candidate = candidate.replace(month=candidate.month + 1)
    return candidate


@router.get("/companies/{company_id}/dashboard", tags=["dashboard"])
def get_company_dashboard(
    company_id: int,
    range_key: str = Query(default="30d", alias="range", pattern="^(week|30d|quarter)$"),
    category: str | None = Query(default=None, pattern="^(customers|competitors|market|internal)$"),
    db: Session = Depends(get_db),
) -> dict:
    from datetime import datetime, timedelta, timezone
    from config import get_settings

    company = get_company_or_404(db, company_id)
    now = datetime.now(timezone.utc)
    days = {"week": 7, "30d": 30, "quarter": 90}.get(range_key, 30)
    cutoff = now - timedelta(days=days)
    prev_cutoff = cutoff - timedelta(days=days)

    profile = dict(company.profile or {})
    meta = dict(profile.get("_meta") or {})
    previous_visit = meta.get("dashboard_last_visit_at")
    meta["dashboard_last_visit_at"] = now.isoformat()
    profile["_meta"] = meta
    company.profile = profile
    db.commit()

    workflow = _compute_workflow_status(db, company)
    first_name = (
        profile.get("founder_first_name")
        or meta.get("user_first_name")
        or None
    )

    all_sources = list(
        db.scalars(
            select(Source)
            .where(Source.company_id == company_id, Source.status.in_(["approved", "paused"]))
            .order_by(Source.id.asc())
        ).all()
    )
    source_map = {s.id: s for s in all_sources}

    all_records = list(
        db.execute(
            select(Record, Source)
            .outerjoin(Source, Record.source_id == Source.id)
            .where(Record.company_id == company_id)
            .order_by(Record.id.desc())
        ).all()
    )

    def _rec_dt(rec: Record) -> datetime:
        dt = rec.discovered or rec.published or now
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    # Analysed signals
    analysed_rows = [(rec, src) for rec, src in all_records if rec.analysis is not None]
    rel_map = _related_records_map(analysed_rows)

    def _matches_cat(rec: Record, src: Source | None) -> bool:
        if not category:
            return True
        return _map_category(src, rec.analysis or {}) == category

    in_range_records = [
        (rec, src) for rec, src in all_records if _rec_dt(rec) >= cutoff and _matches_cat(rec, src)
    ]
    in_range_signals_rows = [
        (rec, src)
        for rec, src in analysed_rows
        if _rec_dt(rec) >= cutoff and _matches_cat(rec, src)
    ]
    prev_range_signals_rows = [
        (rec, src)
        for rec, src in analysed_rows
        if prev_cutoff <= _rec_dt(rec) < cutoff and _matches_cat(rec, src)
    ]

    serialized_in_range = [
        _serialize_signal(
            company,
            rec,
            src,
            related_ids=[r["id"] for r in rel_map.get(rec.id, [])],
        )
        for rec, src in in_range_signals_rows
    ]

    non_dismissed = [s for s in serialized_in_range if s["status"] != "dismissed"]
    top_priorities = sorted(non_dismissed, key=lambda s: (-s["priorityValue"], -s["id"]))[:3]

    recent_signals = sorted(
        non_dismissed,
        key=lambda s: (s.get("detectedAt") or "", s["id"]),
        reverse=True,
    )[:5]

    evidence_by_id: dict[str, dict] = {}
    rec_lookup = {rec.id: (rec, src) for rec, src in all_records}
    for sig in [*top_priorities, *recent_signals]:
        pair = rec_lookup.get(sig["id"])
        if pair:
            evidence_by_id[str(sig["id"])] = _serialize_collected_item(pair[0], pair[1], excerpt_len=320)

    # KPIs per category across the 4 Signal Stack categories
    spark_start = now.date() - timedelta(days=6)
    kpis: list[dict] = []
    for cat in ("customers", "competitors", "market", "internal"):
        cat_sigs = [
            _serialize_signal(company, rec, src)
            for rec, src in analysed_rows
            if _rec_dt(rec) >= cutoff and _map_category(src, rec.analysis or {}) == cat
        ]
        prev_cat_count = sum(
            1
            for rec, src in analysed_rows
            if prev_cutoff <= _rec_dt(rec) < cutoff and _map_category(src, rec.analysis or {}) == cat
        )
        spark_buckets = [0] * 7
        for sig in cat_sigs:
            raw_d = sig.get("detectedAt")
            if not raw_d:
                continue
            try:
                sig_date = datetime.fromisoformat(raw_d).date()
                idx = (sig_date - spark_start).days
                if 0 <= idx < 7:
                    spark_buckets[idx] += 1
            except Exception:
                pass
        files_analysed = (
            sum(
                1
                for rec, src in analysed_rows
                if _rec_dt(rec) >= cutoff and _map_category(src, rec.analysis or {}) == "internal"
            )
            if cat == "internal"
            else None
        )
        kpis.append(
            {
                "category": cat,
                "newSignals": len(cat_sigs),
                "opportunities": sum(1 for s in cat_sigs if s["classification"] == "opportunity"),
                "threats": sum(1 for s in cat_sigs if s["classification"] == "threat"),
                "deltaPct": _compute_delta_pct(len(cat_sigs), prev_cat_count)
                if prev_cat_count > 0
                else None,
                "spark": spark_buckets,
                "filesAnalysed": files_analysed,
            }
        )

    # Heatmap: 7 days (0=Sun..6=Sat) x 8 3-hour buckets
    heat_counts: dict[tuple[int, int], int] = {(d, b): 0 for d in range(7) for b in range(8)}
    for rec, _src in in_range_records:
        dt = _rec_dt(rec)
        # Python weekday(): Mon=0..Sun=6 -> Sun=0..Sat=6
        sun_day = (dt.weekday() + 1) % 7
        bucket = min(7, dt.hour // 3)
        heat_counts[(sun_day, bucket)] += 1

    heatmap = [
        {"day": d, "bucket": b, "count": heat_counts[(d, b)]}
        for b in range(8)
        for d in range(7)
    ]
    heatmap_max = max((c["count"] for c in heatmap), default=0)
    heatmap_insight: str | None = None
    if heatmap_max > 0:
        best = max(heatmap, key=lambda c: c["count"])
        day_names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        start_hr = best["bucket"] * 3
        end_hr = start_hr + 3
        heatmap_insight = (
            f"Busiest publishing window: {day_names[best['day']]} "
            f"{start_hr:02d}:00–{end_hr:02d}:00 UTC ({best['count']} item{'s' if best['count'] != 1 else ''})"
        )

    # Trend chart (evidence vs signals per day)
    start_date = now.date() - timedelta(days=days - 1)
    trend_map: dict[str, dict] = {}
    for i in range(days):
        d_str = (start_date + timedelta(days=i)).isoformat()
        trend_map[d_str] = {
            "date": d_str,
            "evidence": 0,
            "signals": 0,
            "topHeadline": None,
            "_topPriority": -1,
        }

    for rec, _src in in_range_records:
        d_str = _rec_dt(rec).date().isoformat()
        if d_str in trend_map:
            trend_map[d_str]["evidence"] += 1

    for sig in serialized_in_range:
        raw_d = sig.get("detectedAt")
        if not raw_d:
            continue
        d_str = raw_d[:10]
        if d_str in trend_map:
            trend_map[d_str]["signals"] += 1
            if sig["priorityValue"] > trend_map[d_str]["_topPriority"]:
                trend_map[d_str]["_topPriority"] = sig["priorityValue"]
                trend_map[d_str]["topHeadline"] = sig["headline"]

    trend = [
        {
            "date": row["date"],
            "evidence": row["evidence"],
            "signals": row["signals"],
            "topHeadline": row["topHeadline"],
        }
        for row in [trend_map[k] for k in sorted(trend_map.keys())]
    ]

    mix = {
        "opportunity": sum(1 for s in serialized_in_range if s["classification"] == "opportunity"),
        "threat": sum(1 for s in serialized_in_range if s["classification"] == "threat"),
        "neutral": sum(1 for s in serialized_in_range if s["classification"] == "neutral"),
    }

    # Latest report & brief schedule
    import os

    latest_report = db.scalar(
        select(Report).where(Report.company_id == company_id).order_by(Report.id.desc()).limit(1)
    )
    sched_enabled = bool(os.getenv("ENABLE_SCHEDULER", "0") == "1" or meta.get("automation_enabled"))
    brief_info = {
        "nextRunAt": _next_weekly_monday_0600(now).isoformat() if sched_enabled else None,
        "lastGeneratedAt": latest_report.created.isoformat() if latest_report and latest_report.created else None,
        "latestBriefId": str(latest_report.id) if latest_report else None,
    }

    # Scheduled jobs + real last runs
    last_brief_job = db.scalar(
        select(JobLog)
        .where(JobLog.company_id == company_id, JobLog.job.in_(["weekly_brief", "brief", "job:brief"]))
        .order_by(JobLog.id.desc())
        .limit(1)
    )
    last_audit_job = db.scalar(
        select(JobLog)
        .where(JobLog.company_id == company_id, JobLog.job.in_(["monthly_audit", "audit", "job:audit"]))
        .order_by(JobLog.id.desc())
        .limit(1)
    )
    jobs_list = [
        {
            "id": "weekly_brief",
            "name": "Weekly Monday Brief",
            "enabled": sched_enabled,
            "nextRunAt": _next_weekly_monday_0600(now).isoformat() if sched_enabled else None,
            "lastRun": (
                {"status": last_brief_job.status, "finishedAt": last_brief_job.at.isoformat()}
                if last_brief_job
                else (
                    {"status": "ok", "finishedAt": latest_report.created.isoformat()}
                    if latest_report and latest_report.created
                    else None
                )
            ),
        },
        {
            "id": "monthly_audit",
            "name": "Monthly Source Audit",
            "enabled": sched_enabled,
            "nextRunAt": _next_monthly_1st_0630(now).isoformat() if sched_enabled else None,
            "lastRun": (
                {"status": last_audit_job.status, "finishedAt": last_audit_job.at.isoformat()}
                if last_audit_job
                else None
            ),
        },
    ]

    # Source health
    approved_sources = [s for s in all_sources if s.status == "approved"]
    failing_cnt = sum(1 for s in approved_sources if s.health == "failing")
    stale_cnt = sum(
        1
        for s in approved_sources
        if s.last_checked is None
        or (
            (s.last_checked.replace(tzinfo=timezone.utc) if s.last_checked.tzinfo is None else s.last_checked)
            < now - timedelta(days=7)
        )
    )
    healthy_cnt = sum(1 for s in approved_sources if s.health == "ok")
    healthy_pct = round((healthy_cnt / len(approved_sources)) * 100) if approved_sources else 100

    # Source performance table
    items_per_src: dict[int, int] = {}
    signals_per_src: dict[int, int] = {}
    for rec, _src in in_range_records:
        if rec.source_id:
            items_per_src[rec.source_id] = items_per_src.get(rec.source_id, 0) + 1
            if rec.analysis is not None:
                signals_per_src[rec.source_id] = signals_per_src.get(rec.source_id, 0) + 1

    perf_rows: list[dict] = []
    for src in all_sources:
        if category and src.category != category:
            continue
        it_cnt = items_per_src.get(src.id, 0)
        sig_cnt = signals_per_src.get(src.id, 0)
        yield_pct = round((sig_cnt / it_cnt) * 100) if it_cnt > 0 else 0
        perf_rows.append(
            {
                "sourceId": src.id,
                "name": src.name,
                "domain": _domain_of(src.url),
                "category": src.category,
                "type": src.source_type or "webpage",
                "yieldPct": yield_pct,
                "items": it_cnt,
                "signals": sig_cnt,
                "lastCheckedAt": src.last_checked.isoformat() if src.last_checked else None,
                "status": src.status,
                "health": src.health,
            }
        )
    perf_rows.sort(key=lambda r: (-r["signals"], -r["items"], r["name"].lower()))

    running_crawl = (
        db.scalar(
            select(func.count(JobLog.id)).where(
                JobLog.company_id == company_id,
                JobLog.job == "crawl_run",
                JobLog.status == "running",
            )
        )
        or 0
    ) > 0
    running_analysis = (
        db.scalar(
            select(func.count(JobLog.id)).where(
                JobLog.company_id == company_id,
                JobLog.job == "job:analyse",
                JobLog.status == "running",
            )
        )
        or 0
    ) > 0

    suggested_questions: list[str] = []
    if mix["threat"] > 0:
        suggested_questions.append("Which threats should we prioritize this week?")
    if mix["opportunity"] > 0:
        suggested_questions.append("Where are our strongest growth opportunities?")
    if prev_range_signals_rows:
        suggested_questions.append("How does this period compare to the prior period?")

    return {
        "range": range_key,
        "category": category,
        "user": {"firstName": first_name} if first_name else {},
        "lastVisitAt": previous_visit,
        "workflowStatus": workflow,
        "topPriorities": top_priorities,
        "recentSignals": recent_signals,
        "evidenceById": evidence_by_id,
        "brief": brief_info,
        "kpis": kpis,
        "heatmap": heatmap,
        "heatmapMax": heatmap_max,
        "heatmapInsight": heatmap_insight,
        "trend": trend,
        "mix": mix,
        "jobs": jobs_list,
        "health": {
            "healthyPct": healthy_pct,
            "failing": failing_cnt,
            "stale": stale_cnt,
        },
        "sourcePerformance": perf_rows,
        "totalSignalsInRange": len(serialized_in_range),
        "lastUpdatedAt": now.isoformat(),
        "activeCrawlRunning": running_crawl,
        "activeAnalysisRunning": running_analysis,
        "suggestedQuestions": suggested_questions,
    }


@router.get("/companies/{company_id}/search", tags=["dashboard"])
def search_company_workspace(
    company_id: int,
    q: str = Query(default="", max_length=200),
    db: Session = Depends(get_db),
) -> dict:
    company = get_company_or_404(db, company_id)
    needle = q.strip().lower()
    if not needle:
        return {"signals": [], "sources": []}

    rows = _analysed_rows(db, company_id)
    matched_signals = []
    for rec, src in rows:
        a = rec.analysis or {}
        hay = f"{a.get('title') or rec.title} {a.get('summary') or ''} {_domain_of(rec.url)}".lower()
        if needle in hay:
            matched_signals.append(_serialize_signal(company, rec, src))
            if len(matched_signals) >= 8:
                break

    sources = list(
        db.scalars(
            select(Source).where(Source.company_id == company_id).order_by(Source.id.desc())
        ).all()
    )
    matched_sources = []
    for src in sources:
        hay = f"{src.name} {src.url} {src.category}".lower()
        if needle in hay:
            matched_sources.append(
                {
                    "id": src.id,
                    "name": src.name,
                    "domain": _domain_of(src.url),
                    "category": src.category,
                    "status": src.status,
                }
            )
            if len(matched_sources) >= 8:
                break

    return {"signals": matched_signals, "sources": matched_sources}


# --------------------------------------------------------------------------- #
# Automation & Scheduler Control Plane (Step 6)
# --------------------------------------------------------------------------- #
def _parse_iso_dt(raw: str, field_name: str) -> "datetime":
    from datetime import datetime, timezone

    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name} ISO timestamp: {raw}") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@router.get("/companies/{company_id}/settings", tags=["settings"])
def get_company_settings_route(company_id: int, db: Session = Depends(get_db)) -> dict:
    import automation

    company = get_company_or_404(db, company_id)
    return automation.get_company_settings(db, company)


@router.patch("/companies/{company_id}/settings", tags=["settings"])
def patch_company_settings_route(
    company_id: int,
    payload: CompanySettingsPatchIn,
    db: Session = Depends(get_db),
) -> dict:
    import automation

    company = get_company_or_404(db, company_id)
    try:
        return automation.update_company_settings(db, company, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/companies/{company_id}/automation", tags=["automation-v2"])
def get_company_automation(company_id: int, db: Session = Depends(get_db)) -> dict:
    import automation

    company = get_company_or_404(db, company_id)
    return automation.build_overview(db, company)


@router.get("/companies/{company_id}/automation/calendar", tags=["automation-v2"])
def get_company_automation_calendar(
    company_id: int,
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    db: Session = Depends(get_db),
) -> dict:
    from datetime import date

    import automation

    company = get_company_or_404(db, company_id)
    automation.ensure_default_schedules(db, company)
    try:
        d_from = date.fromisoformat(from_date[:10])
        d_to = date.fromisoformat(to_date[:10])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="from and to must be YYYY-MM-DD dates") from exc
    if d_to < d_from or (d_to - d_from).days > 45:
        raise HTTPException(status_code=400, detail="Date range must be 1..45 days")
    return {"days": automation.build_calendar(db, company_id, d_from, d_to)}


@router.post("/companies/{company_id}/automation/schedules/preview", tags=["automation-v2"])
def preview_automation_schedule(
    company_id: int,
    payload: ScheduleDraftIn,
    db: Session = Depends(get_db),
) -> dict:
    import automation

    get_company_or_404(db, company_id)
    try:
        cron_str = automation.build_cron_from_fields(
            payload.frequency,
            cron=payload.cron,
            time_of_day=payload.timeOfDay,
            days_of_week=payload.daysOfWeek,
            interval_hours=payload.intervalHours,
            day_of_month=payload.dayOfMonth,
        )
        next_runs = automation.compute_next_runs(cron_str, payload.timezone, count=5)
        human, per_period = automation.describe_schedule(
            cron_str,
            payload.timezone,
            frequency=payload.frequency,
            days_of_week=payload.daysOfWeek,
            interval_hours=payload.intervalHours,
            day_of_month=payload.dayOfMonth,
            time_of_day=payload.timeOfDay,
        )
    except ValueError as exc:
        return {
            "valid": False,
            "cron": payload.cron or "",
            "error": str(exc),
            "humanReadable": None,
            "runsPerPeriodLabel": None,
            "nextRuns": [],
        }

    return {
        "valid": True,
        "cron": cron_str,
        "error": None,
        "humanReadable": human,
        "runsPerPeriodLabel": per_period,
        "nextRuns": [dt.isoformat() for dt in next_runs],
    }


@router.post("/companies/{company_id}/automation/schedules", status_code=201, tags=["automation-v2"])
def create_automation_schedule(
    company_id: int,
    payload: ScheduleDraftIn,
    db: Session = Depends(get_db),
) -> dict:
    import automation
    import scheduler

    company = get_company_or_404(db, company_id)
    existing = automation.ensure_default_schedules(db, company)
    if len(existing) >= 12:
        raise HTTPException(status_code=400, detail="Maximum number of schedules (12) reached")

    try:
        cron_str = automation.build_cron_from_fields(
            payload.frequency,
            cron=payload.cron,
            time_of_day=payload.timeOfDay,
            days_of_week=payload.daysOfWeek,
            interval_hours=payload.intervalHours,
            day_of_month=payload.dayOfMonth,
        )
        automation.parse_cron_trigger(cron_str, payload.timezone)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job_id = f"c{company_id}_{payload.jobType}_{int(automation.utcnow().timestamp())}"
    sched = AutomationSchedule(
        company_id=company_id,
        job_type=payload.jobType,
        name=payload.name.strip(),
        enabled=payload.enabled,
        frequency=payload.frequency,
        cron=cron_str,
        timezone=payload.timezone,
        days_of_week=payload.daysOfWeek,
        time_of_day=payload.timeOfDay,
        interval_hours=payload.intervalHours,
        day_of_month=str(payload.dayOfMonth) if payload.dayOfMonth is not None else None,
        depends_on=payload.dependsOn,
        misfire_policy=payload.misfire.policy,
        grace_seconds=payload.misfire.graceSeconds,
        max_retries=payload.retries.max,
        retry_delay_seconds=payload.retries.delaySeconds,
        no_overlap=payload.noOverlap,
        delivery=payload.delivery.model_dump() if payload.delivery else None,
        options=payload.options or {},
        scheduler_job_id=job_id,
        is_custom=True,
    )
    db.add(sched)
    db.commit()
    db.refresh(sched)
    scheduler.sync_schedule(sched)
    return automation.serialize_schedule(sched, None)


@router.patch("/companies/{company_id}/automation/schedules/{schedule_id}", tags=["automation-v2"])
def update_automation_schedule(
    company_id: int,
    schedule_id: int,
    payload: SchedulePatchIn,
    db: Session = Depends(get_db),
) -> dict:
    import automation
    import scheduler

    get_company_or_404(db, company_id)
    sched = db.get(AutomationSchedule, schedule_id)
    if sched is None or sched.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"Schedule {schedule_id} not found")

    if payload.name is not None:
        sched.name = payload.name.strip()
    if payload.enabled is not None:
        sched.enabled = payload.enabled
        sched.paused_at = None if payload.enabled else automation.utcnow()
    if payload.frequency is not None:
        sched.frequency = payload.frequency
    if payload.daysOfWeek is not None:
        sched.days_of_week = payload.daysOfWeek
    if payload.timeOfDay is not None:
        sched.time_of_day = payload.timeOfDay
    if payload.intervalHours is not None:
        sched.interval_hours = payload.intervalHours
    if payload.dayOfMonth is not None:
        sched.day_of_month = str(payload.dayOfMonth)
    if payload.timezone is not None:
        try:
            automation.validate_timezone(payload.timezone)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        sched.timezone = payload.timezone
    if payload.dependsOn is not None:
        sched.depends_on = payload.dependsOn or None
    if payload.misfire is not None:
        sched.misfire_policy = payload.misfire.policy
        sched.grace_seconds = payload.misfire.graceSeconds
    if payload.retries is not None:
        sched.max_retries = payload.retries.max
        sched.retry_delay_seconds = payload.retries.delaySeconds
    if payload.noOverlap is not None:
        sched.no_overlap = payload.noOverlap
    if payload.delivery is not None:
        sched.delivery = payload.delivery.model_dump()
    if payload.options is not None:
        sched.options = payload.options
    if payload.pausedUntil is not None:
        sched.paused_until = _parse_iso_dt(payload.pausedUntil, "pausedUntil") if payload.pausedUntil else None

    # Recompute cron if schedule fields changed
    if any(
        x is not None
        for x in (
            payload.frequency,
            payload.cron,
            payload.timeOfDay,
            payload.daysOfWeek,
            payload.intervalHours,
            payload.dayOfMonth,
            payload.timezone,
        )
    ):
        try:
            dom_arg = sched.day_of_month
            cron_str = automation.build_cron_from_fields(
                sched.frequency,
                cron=payload.cron if payload.cron is not None else sched.cron,
                time_of_day=sched.time_of_day,
                days_of_week=sched.days_of_week,
                interval_hours=sched.interval_hours,
                day_of_month=dom_arg,
            )
            automation.parse_cron_trigger(cron_str, sched.timezone)
            sched.cron = cron_str
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    sched.updated = automation.utcnow()
    db.commit()
    db.refresh(sched)
    scheduler.sync_schedule(sched)

    latest_run = db.scalar(
        select(AutomationRun)
        .where(AutomationRun.schedule_id == sched.id)
        .order_by(AutomationRun.id.desc())
    )
    return automation.serialize_schedule(sched, latest_run)


@router.delete("/companies/{company_id}/automation/schedules/{schedule_id}", status_code=204, tags=["automation-v2"])
def delete_automation_schedule(
    company_id: int,
    schedule_id: int,
    db: Session = Depends(get_db),
) -> Response:
    import scheduler

    get_company_or_404(db, company_id)
    sched = db.get(AutomationSchedule, schedule_id)
    if sched is None or sched.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"Schedule {schedule_id} not found")
    if not sched.is_custom:
        raise HTTPException(status_code=400, detail="Default schedules cannot be deleted; pause or disable instead.")
    job_id = sched.scheduler_job_id
    db.delete(sched)
    db.commit()
    scheduler.remove_schedule_job(job_id)
    return Response(status_code=204)


@router.post("/companies/{company_id}/automation/schedules/{schedule_id}/run", status_code=202, tags=["automation-v2"])
def run_automation_schedule_now(
    company_id: int,
    schedule_id: int,
    db: Session = Depends(get_db),
) -> dict:
    import automation

    get_company_or_404(db, company_id)
    sched = db.get(AutomationSchedule, schedule_id)
    if sched is None or sched.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"Schedule {schedule_id} not found")
    run = automation.trigger_schedule_run(db, company_id, sched, trigger="manual", spawn=True)
    return automation._serialize_run_summary(run)


def _filter_automation_runs(
    db: Session,
    company_id: int,
    *,
    job: str | None = None,
    status: str | None = None,
    trigger: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    q: str | None = None,
) -> list[AutomationRun]:
    query = select(AutomationRun).where(AutomationRun.company_id == company_id).order_by(AutomationRun.id.desc())
    rows = list(db.scalars(query).all())
    out: list[AutomationRun] = []
    from_dt = _parse_iso_dt(f"{date_from}T00:00:00+00:00", "dateFrom") if date_from else None
    to_dt = _parse_iso_dt(f"{date_to}T23:59:59+00:00", "dateTo") if date_to else None
    needle = (q or "").strip().lower()
    for r in rows:
        if job and job != "all" and r.job_type != job and str(r.schedule_id) != job:
            continue
        if status and status != "all" and r.status != status:
            continue
        if trigger and trigger != "all" and r.trigger != trigger:
            continue
        s_dt = r.scheduled_for
        if s_dt.tzinfo is None:
            from datetime import timezone as _tz
            s_dt = s_dt.replace(tzinfo=_tz.utc)
        if from_dt and s_dt < from_dt:
            continue
        if to_dt and s_dt > to_dt:
            continue
        if needle:
            hay = f"{r.id} {r.job_name} {r.job_type} {r.scheduler_job_id} {r.error or ''} {r.skipped_reason or ''}".lower()
            if needle not in hay:
                continue
        out.append(r)
    return out


@router.get("/companies/{company_id}/automation/runs", tags=["automation-v2"])
def list_automation_runs(
    company_id: int,
    job: str | None = Query(default=None),
    status: str | None = Query(default=None),
    trigger: str | None = Query(default=None),
    dateFrom: str | None = Query(default=None),
    dateTo: str | None = Query(default=None),
    q: str | None = Query(default=None),
    cursor: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict:
    import automation

    get_company_or_404(db, company_id)
    filtered = _filter_automation_runs(
        db,
        company_id,
        job=job,
        status=status,
        trigger=trigger,
        date_from=dateFrom,
        date_to=dateTo,
        q=q,
    )
    if cursor is not None:
        filtered = [r for r in filtered if r.id < cursor]
    has_more = len(filtered) > limit
    page = filtered[:limit]
    return {
        "items": [automation._serialize_run_summary(r) for r in page],
        "total": len(filtered),
        "nextCursor": str(page[-1].id) if has_more and page else None,
    }


@router.get("/companies/{company_id}/automation/runs/export", tags=["automation-v2"])
def export_automation_runs(
    company_id: int,
    job: str | None = Query(default=None),
    status: str | None = Query(default=None),
    trigger: str | None = Query(default=None),
    dateFrom: str | None = Query(default=None),
    dateTo: str | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> Response:
    import automation

    get_company_or_404(db, company_id)
    runs = _filter_automation_runs(
        db,
        company_id,
        job=job,
        status=status,
        trigger=trigger,
        date_from=dateFrom,
        date_to=dateTo,
        q=q,
    )
    csv_text = automation.export_runs_csv(runs)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="company-{company_id}-automation-runs.csv"'},
    )


@router.get("/companies/{company_id}/automation/runs/{run_id}", tags=["automation-v2"])
def get_automation_run(
    company_id: int,
    run_id: int,
    db: Session = Depends(get_db),
) -> dict:
    import automation

    get_company_or_404(db, company_id)
    run = db.get(AutomationRun, run_id)
    if run is None or run.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"Automation run {run_id} not found")
    return {
        "run": automation._serialize_run_summary(run),
        "logs": list(run.logs or []),
    }


@router.post("/companies/{company_id}/automation/runs/{run_id}/retry", status_code=202, tags=["automation-v2"])
def retry_automation_run(
    company_id: int,
    run_id: int,
    db: Session = Depends(get_db),
) -> dict:
    import automation

    get_company_or_404(db, company_id)
    run = db.get(AutomationRun, run_id)
    if run is None or run.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"Automation run {run_id} not found")
    sched = db.get(AutomationSchedule, run.schedule_id)
    if sched is None:
        raise HTTPException(status_code=404, detail="Schedule for this run no longer exists")
    retried = automation.trigger_schedule_run(db, company_id, sched, trigger="retry", spawn=True)
    return automation._serialize_run_summary(retried)


@router.get("/companies/{company_id}/automation/runs/{run_id}/logs", tags=["automation-v2"])
def get_automation_run_logs(
    company_id: int,
    run_id: int,
    cursor: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    get_company_or_404(db, company_id)
    run = db.get(AutomationRun, run_id)
    if run is None or run.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"Automation run {run_id} not found")
    logs = list(run.logs or [])
    if cursor is not None:
        logs = [ln for ln in logs if int(ln.get("id", 0)) > cursor]
    return {"items": logs, "nextCursor": None}


@router.get("/companies/{company_id}/automation/runs/{run_id}/logs/stream", tags=["automation-v2"])
def stream_automation_run_logs(
    company_id: int,
    run_id: int,
    request: Request,
    afterId: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    import json as _json
    import time as _time
    import db as db_mod

    get_company_or_404(db, company_id)
    run = db.get(AutomationRun, run_id)
    if run is None or run.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"Automation run {run_id} not found")

    last_id_hdr = request.headers.get("last-event-id")
    start_after = int(last_id_hdr) if (last_id_hdr and last_id_hdr.isdigit()) else afterId

    def event_stream():
        cursor_id = start_after
        ticks = 0
        max_ticks = 300
        while ticks < max_ticks:
            with db_mod.SessionLocal() as s:
                row = s.get(AutomationRun, run_id)
                if row is None:
                    yield 'event: done\ndata: {"status": "unknown"}\n\n'
                    return
                for ln in list(row.logs or []):
                    lid = int(ln.get("id", 0))
                    if lid > cursor_id:
                        cursor_id = lid
                        yield f"id: {lid}\nevent: log\ndata: {_json.dumps(ln)}\n\n"
                if row.status not in ("queued", "running"):
                    yield f"event: done\ndata: {_json.dumps({'status': row.status})}\n\n"
                    return
            ticks += 1
            if ticks % 15 == 0:
                yield ": keepalive\n\n"
            _time.sleep(0.35)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/companies/{company_id}/automation/overrides", tags=["automation-v2"])
def list_automation_overrides(company_id: int, db: Session = Depends(get_db)) -> dict:
    import automation

    get_company_or_404(db, company_id)
    rows = list(
        db.scalars(
            select(AutomationOverride)
            .where(AutomationOverride.company_id == company_id)
            .order_by(AutomationOverride.starts_at.asc())
        ).all()
    )
    return {"items": [automation.serialize_override(r) for r in rows]}


@router.post("/companies/{company_id}/automation/overrides/preview", tags=["automation-v2"])
def preview_automation_override(
    company_id: int,
    payload: OverrideDraftIn,
    db: Session = Depends(get_db),
) -> dict:
    import automation

    get_company_or_404(db, company_id)
    starts_dt = _parse_iso_dt(payload.startsAt, "startsAt")
    ends_dt = _parse_iso_dt(payload.endsAt, "endsAt") if payload.endsAt else None
    new_dt = _parse_iso_dt(payload.newTime, "newTime") if payload.newTime else None
    try:
        return automation.preview_override(
            db,
            company_id,
            ov_type=payload.type,
            schedule_id=payload.scheduleId,
            starts_at=starts_dt,
            ends_at=ends_dt,
            new_time=new_dt,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/companies/{company_id}/automation/overrides", status_code=201, tags=["automation-v2"])
def create_automation_override(
    company_id: int,
    payload: OverrideDraftIn,
    db: Session = Depends(get_db),
) -> dict:
    import automation

    get_company_or_404(db, company_id)
    if payload.scheduleId is not None:
        sched = db.get(AutomationSchedule, payload.scheduleId)
        if sched is None or sched.company_id != company_id:
            raise HTTPException(status_code=404, detail=f"Schedule {payload.scheduleId} not found")

    starts_dt = _parse_iso_dt(payload.startsAt, "startsAt")
    ends_dt = _parse_iso_dt(payload.endsAt, "endsAt") if payload.endsAt else None
    new_dt = _parse_iso_dt(payload.newTime, "newTime") if payload.newTime else None

    ov = AutomationOverride(
        company_id=company_id,
        schedule_id=payload.scheduleId,
        type=payload.type,
        starts_at=starts_dt,
        ends_at=ends_dt,
        new_time=new_dt,
        reason=payload.reason.strip() if payload.reason else None,
        created_by="Founder",
    )
    db.add(ov)
    db.commit()
    db.refresh(ov)
    return automation.serialize_override(ov)


@router.delete("/companies/{company_id}/automation/overrides/{override_id}", status_code=204, tags=["automation-v2"])
def delete_automation_override(
    company_id: int,
    override_id: int,
    db: Session = Depends(get_db),
) -> Response:
    get_company_or_404(db, company_id)
    ov = db.get(AutomationOverride, override_id)
    if ov is None or ov.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"Override {override_id} not found")
    db.delete(ov)
    db.commit()
    return Response(status_code=204)


# --------------------------------------------------------------------------- #
# Monday Morning Brief v2 (Showpiece)
# --------------------------------------------------------------------------- #
@router.get("/companies/{company_id}/briefs/latest", tags=["briefs-v2"])
def get_latest_brief_v2(company_id: int, db: Session = Depends(get_db)) -> dict:
    import brief_api

    company = get_company_or_404(db, company_id)
    latest = db.scalar(
        select(Report).where(Report.company_id == company_id).order_by(Report.id.desc()).limit(1)
    )
    prereq = brief_api.get_prerequisites(db, company_id)
    if latest is None:
        return {
            "brief": None,
            "prerequisites": prereq,
        }
    return {
        "brief": brief_api.serialize_brief(db, company, latest),
        "prerequisites": prereq,
    }


@router.get("/companies/{company_id}/briefs/generation", tags=["briefs-v2"])
def get_brief_generation_v2(company_id: int, db: Session = Depends(get_db)) -> dict:
    import brief_api

    get_company_or_404(db, company_id)
    return brief_api.get_brief_generation(db, company_id)


@router.post("/companies/{company_id}/briefs/generate", status_code=202, tags=["briefs-v2"])
def generate_brief_v2(company_id: int, db: Session = Depends(get_db)) -> dict:
    import brief_api

    company = get_company_or_404(db, company_id)
    try:
        return brief_api.start_brief_generation(db, company)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/companies/{company_id}/briefs/compare", tags=["briefs-v2"])
def compare_briefs_v2(
    company_id: int,
    a: int = Query(...),
    b: int = Query(...),
    db: Session = Depends(get_db),
) -> dict:
    import brief_api

    company = get_company_or_404(db, company_id)
    rep_a = db.get(Report, a)
    rep_b = db.get(Report, b)
    if rep_a is None or rep_a.company_id != company_id or rep_b is None or rep_b.company_id != company_id:
        raise HTTPException(status_code=404, detail="Brief not found for comparison")
    return brief_api.compare_briefs(db, company, rep_a, rep_b)


@router.get("/companies/{company_id}/briefs", tags=["briefs-v2"])
def list_briefs_v2(
    company_id: int,
    cursor: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
) -> dict:
    import brief_api

    get_company_or_404(db, company_id)
    all_rows = list(
        db.scalars(select(Report).where(Report.company_id == company_id).order_by(Report.id.asc())).all()
    )
    version_by_id = {r.id: idx + 1 for idx, r in enumerate(all_rows)}
    desc_rows = list(reversed(all_rows))
    if cursor is not None:
        desc_rows = [r for r in desc_rows if r.id < cursor]
    has_more = len(desc_rows) > limit
    page = desc_rows[:limit]
    return {
        "items": [brief_api.serialize_brief_summary(r, version_by_id[r.id]) for r in page],
        "nextCursor": str(page[-1].id) if has_more and page else None,
        "total": len(all_rows),
    }


@router.get("/companies/{company_id}/briefs/{brief_id}", tags=["briefs-v2"])
def get_brief_v2(company_id: int, brief_id: int, db: Session = Depends(get_db)) -> dict:
    import brief_api

    company = get_company_or_404(db, company_id)
    report = db.get(Report, brief_id)
    if report is None or report.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"Brief {brief_id} not found")
    return brief_api.serialize_brief(db, company, report, mark_read=True)


@router.patch("/companies/{company_id}/briefs/{brief_id}", tags=["briefs-v2"])
def patch_brief_v2(
    company_id: int,
    brief_id: int,
    payload: BriefPatchIn,
    db: Session = Depends(get_db),
) -> dict:
    import brief_api

    company = get_company_or_404(db, company_id)
    report = db.get(Report, brief_id)
    if report is None or report.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"Brief {brief_id} not found")
    content = dict(report.content or {})
    if payload.status is not None:
        content["status"] = payload.status
    if payload.removeItemIds is not None:
        cur = set(content.get("removed_item_ids", []))
        cur.update(payload.removeItemIds)
        content["removed_item_ids"] = sorted(cur)
    if payload.notes is not None:
        content["notes"] = [n.model_dump() for n in payload.notes]
    report.content = content
    db.commit()
    db.refresh(report)
    return brief_api.serialize_brief(db, company, report)


def _update_brief_action_impl(
    company_id: int,
    brief_id: int | None,
    action_id: str,
    payload: BriefActionPatchIn,
    db: Session,
) -> dict:
    import brief
    import brief_api

    company = get_company_or_404(db, company_id)
    if brief_id is not None:
        report = db.get(Report, brief_id)
        if report is None or report.company_id != company_id:
            raise HTTPException(status_code=404, detail=f"Brief {brief_id} not found")
    else:
        report = db.scalar(
            select(Report).where(Report.company_id == company_id).order_by(Report.id.desc()).limit(1)
        )
        if report is None:
            raise HTTPException(status_code=404, detail="No brief found")

    content = dict(report.content or {})
    actions = list(content.get("actions", []))
    target_idx: int | None = None
    for idx, act in enumerate(actions):
        aid = str(act.get("id") or f"act-{idx}")
        if aid == action_id:
            target_idx = idx
            break
    if target_idx is None:
        raise HTTPException(status_code=404, detail=f"Action {action_id} not found")

    updated = dict(actions[target_idx])
    if payload.done is not None:
        updated["done"] = payload.done
    if payload.owner is not None:
        updated["owner"] = payload.owner.strip() or "Founder"
    if payload.dueDate is not None:
        updated["dueDate"] = payload.dueDate or None
    if payload.order is not None:
        updated["order"] = payload.order
    actions[target_idx] = updated
    content["actions"] = actions
    report.content = content
    report.markdown = brief.render_markdown(content)
    db.commit()
    db.refresh(report)
    ser = brief_api.serialize_brief(db, company, report)
    return next((a for a in ser["actions"] if a["id"] == action_id), updated)


@router.patch("/companies/{company_id}/briefs/{brief_id}/actions/{action_id}", tags=["briefs-v2"])
def patch_brief_action_v2(
    company_id: int,
    brief_id: int,
    action_id: str,
    payload: BriefActionPatchIn,
    db: Session = Depends(get_db),
) -> dict:
    return _update_brief_action_impl(company_id, brief_id, action_id, payload, db)


@router.patch("/companies/{company_id}/actions/{action_id}", tags=["briefs-v2"])
def patch_company_action_v2(
    company_id: int,
    action_id: str,
    payload: BriefActionPatchIn,
    db: Session = Depends(get_db),
) -> dict:
    return _update_brief_action_impl(company_id, None, action_id, payload, db)


@router.post("/companies/{company_id}/briefs/{brief_id}/actions", status_code=201, tags=["briefs-v2"])
def create_brief_action_v2(
    company_id: int,
    brief_id: int,
    payload: BriefActionCreateIn,
    db: Session = Depends(get_db),
) -> dict:
    import brief
    import brief_api

    company = get_company_or_404(db, company_id)
    report = db.get(Report, brief_id)
    if report is None or report.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"Brief {brief_id} not found")

    content = dict(report.content or {})
    actions = list(content.get("actions", []))
    new_id = f"custom-{len(actions) + 1}-{int(brief_api._utcnow().timestamp())}"
    actions.append(
        {
            "id": new_id,
            "action": payload.text.strip(),
            "owner": payload.owner.strip() or "Founder",
            "dueDate": payload.dueDate,
            "effort": payload.effort,
            "why": "",
            "record_ids": [],
            "done": False,
            "isCustom": True,
            "order": len(actions),
        }
    )
    content["actions"] = actions
    report.content = content
    report.markdown = brief.render_markdown(content)
    db.commit()
    db.refresh(report)
    ser = brief_api.serialize_brief(db, company, report)
    return next((a for a in ser["actions"] if a["id"] == new_id), ser["actions"][-1])


@router.get("/companies/{company_id}/briefs/{brief_id}/pdf", tags=["briefs-v2"])
def get_brief_pdf_v2(company_id: int, brief_id: int, db: Session = Depends(get_db)) -> Response:
    get_company_or_404(db, company_id)
    report = db.get(Report, brief_id)
    if report is None or report.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"Brief {brief_id} not found")
    raise HTTPException(
        status_code=501,
        detail="Server PDF rendering is not enabled; use Save as PDF in the browser print dialog.",
    )


@router.post("/companies/{company_id}/briefs/{brief_id}/feedback", tags=["briefs-v2"])
def feedback_brief_v2(
    company_id: int,
    brief_id: int,
    payload: BriefFeedbackIn,
    db: Session = Depends(get_db),
) -> dict:
    import brief_api

    get_company_or_404(db, company_id)
    report = db.get(Report, brief_id)
    if report is None or report.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"Brief {brief_id} not found")
    content = dict(report.content or {})
    content["feedback"] = {
        "useful": payload.useful,
        "comment": payload.comment.strip() if payload.comment else None,
        "at": brief_api._utcnow().isoformat(),
    }
    report.content = content
    db.commit()
    return content["feedback"]


@router.post("/companies/{company_id}/watchlist/{watch_id}/toggle", tags=["briefs-v2"])
def toggle_watchlist_v2(
    company_id: int,
    watch_id: str,
    db: Session = Depends(get_db),
) -> dict:
    company = get_company_or_404(db, company_id)
    profile = dict(company.profile or {})
    meta = dict(profile.get("_meta") or {})
    wl = list(meta.get("watchlist") or [])
    if watch_id in wl:
        wl = [x for x in wl if x != watch_id]
        in_wl = False
    else:
        wl.append(watch_id)
        in_wl = True
    meta["watchlist"] = wl
    profile["_meta"] = meta
    company.profile = profile
    db.commit()
    return {"watchId": watch_id, "inWatchlist": in_wl}





