"""HTTP routes. Every route here is exercised by the UI; no placeholder endpoints."""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import interview
import research
from db import Company, QA, get_db
from schemas import CompanyCreate, CompanyOut, CompanyUpdate, ProfilePatch

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
