"""HTTP routes. Every route here is exercised by the UI; no placeholder endpoints."""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import interview
import research
from db import Company, JobLog, QA, Record, Report, Source, get_db
from schemas import (
    AuditApplyIn,
    CompanyCreate,
    CompanyOut,
    CompanyUpdate,
    ProfilePatch,
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

    raw_url = payload.websiteUrl.strip()
    if not raw_url.lower().startswith(("http://", "https://")):
        raw_url = f"https://{raw_url}"
    website = _validate_http_url(raw_url, field="websiteUrl")
    company = Company(
        name=payload.companyName.strip(),
        website=website,
        context=payload.context.strip(),
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return jobs.start_company_job(db, company.id, "research")


@router.get("/companies", tags=["companies"])
def list_companies(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
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

    return {
        "company": "done" if confirmed else "current",
        "interview": "done"
        if interview_done
        else ("current" if (confirmed or has_profile or qa_count > 0) else "locked"),
        "sources": "done"
        if approved_sources > 0
        else ("current" if (interview_done or total_sources > 0) else "locked"),
        "signals": "done"
        if analysed_records > 0
        else ("current" if approved_sources > 0 else "locked"),
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
@router.post("/companies/{company_id}/research", tags=["research"])
def run_research(company_id: int, db: Session = Depends(get_db)) -> dict:
    company = get_company_or_404(db, company_id)
    try:
        profile = research.research_company(db, company)
    except research.ResearchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
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

    company = get_company_or_404(db, company_id)
    try:
        return discovery.discover(db, company)
    except discovery.DiscoveryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/companies/{company_id}/sources", status_code=201, tags=["sources"])
def add_source(company_id: int, payload: SourceCreate, db: Session = Depends(get_db)):
    import discovery

    company = get_company_or_404(db, company_id)
    raw_url = payload.url.strip()
    if not raw_url.lower().startswith(("http://", "https://")):
        raw_url = f"https://{raw_url}"
    _validate_http_url(raw_url, "url")
    existing = db.scalars(select(Source).where(Source.company_id == company_id)).all()
    if any(source.url.rstrip("/") == raw_url.rstrip("/") for source in existing):
        raise HTTPException(status_code=409, detail="this source already exists for the company")

    ok, detail, final_url, feed_url = discovery.verify_candidate(raw_url)
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
