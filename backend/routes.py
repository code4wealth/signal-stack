"""HTTP routes. Every route here is exercised by the UI; no placeholder endpoints."""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import interview
import research
from db import Company, JobLog, QA, Record, Report, Source, get_db
from schemas import (
    CompanyCreate,
    CompanyOut,
    CompanyUpdate,
    ProfilePatch,
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


class AnswerIn(BaseModel):
    idx: int = Field(ge=0)
    answer: str | None = None
    skip: bool = False


class AnswerEdit(BaseModel):
    answer: str = Field(min_length=1, max_length=8000)


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


@router.get("/companies/{company_id}", tags=["companies"])
def get_company(company_id: int, db: Session = Depends(get_db)) -> dict:
    company = get_company_or_404(db, company_id)
    return {
        **_company_out(company).model_dump(mode="json"),
        "profile": company.profile,
    }


@router.patch("/companies/{company_id}", response_model=CompanyOut, tags=["companies"])
def update_company(
    company_id: int, payload: CompanyUpdate, db: Session = Depends(get_db)
) -> CompanyOut:
    company = get_company_or_404(db, company_id)
    if payload.name is not None:
        company.name = payload.name.strip()
    if payload.website is not None:
        company.website = _validate_http_url(payload.website)
    if payload.context is not None:
        company.context = payload.context
    db.commit()
    db.refresh(company)
    return _company_out(company)


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
    try:
        return interview.answer(db, company, payload.idx, payload.answer, payload.skip)
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
    try:
        return interview.edit_answer(db, company, qa_id, payload.answer)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
def add_source(company_id: int, payload: SourceCreate, db: Session = Depends(get_db)) -> dict:
    import discovery

    company = get_company_or_404(db, company_id)
    _validate_http_url(payload.url, "url")
    existing = db.scalars(select(Source).where(Source.company_id == company_id)).all()
    if any(source.url.rstrip("/") == payload.url.rstrip("/") for source in existing):
        raise HTTPException(status_code=409, detail="this source already exists for the company")

    ok, detail, final_url, feed_url = discovery.verify_candidate(payload.url)
    if not ok:
        raise HTTPException(status_code=400, detail=f"source could not be fetched: {detail}")

    effective_feed = payload.feed_url or feed_url
    source = Source(
        company_id=company_id,
        name=payload.name,
        url=final_url,
        feed_url=effective_feed,
        category=payload.category,
        source_type=payload.source_type or ("rss" if effective_feed else "webpage"),
        description=payload.description or payload.reason,
        reason=payload.reason,
        expected=payload.expected,
        reliability=payload.reliability,
        update_frequency=payload.update_frequency or ("daily" if effective_feed else "weekly"),
        status="pending",
        health="ok",
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return _source_dict(source)


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
        .where(JobLog.company_id == company_id, JobLog.job.in_(("crawl", "analyse")))
        .order_by(JobLog.id.desc())
        .limit(limit)
    ).all()
    return {
        "items": [
            {"id": row.id, "job": row.job, "status": row.status, "at": row.at.isoformat(), "detail": row.detail}
            for row in rows
        ]
    }


@router.get("/companies/{company_id}/intelligence", tags=["crawl"])
def intelligence(
    company_id: int,
    category: str | None = Query(default=None),
    min_score: float = Query(default=0.0, ge=0.0, le=100.0),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    company = get_company_or_404(db, company_id)
    query = (
        select(Record, Source)
        .join(Source, Record.source_id == Source.id, isouter=True)
        .where(Record.company_id == company_id, Record.analysis.is_not(None), Record.total >= min_score)
    )
    if category:
        query = query.where(Source.category == category)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(Record.total.desc(), Record.id.desc()).limit(limit).offset(offset)).all()
    return {
        "company_id": company.id,
        "items": [_record_dict(record, source) for record, source in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def _record_dict(record: Record, source: Source | None) -> dict:
    analysis_data = record.analysis or {}
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


@router.post("/companies/{company_id}/context/reassess", tags=["context"])
def reassess_context(company_id: int, payload: ContextIn, db: Session = Depends(get_db)) -> dict:
    import context as context_module

    company = get_company_or_404(db, company_id)
    try:
        return context_module.reassess(db, company, payload.context, run_discovery=payload.run_discovery)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
