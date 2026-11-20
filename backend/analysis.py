"""Phase 5b - evidence-backed analysis.

Each new record gets one Analysis from the LLM, then the evidence snippet is
checked against the source text. A snippet that is not literally present caps
evidence_strength at 0.2 and is flagged, so a hallucinated quote cannot inflate a
score. Ranking is pure code (ranking.py).
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone

from sqlalchemy import select

import llm
import ranking
from config import get_settings
from db import JobLog, Record, Source
from schemas import Analysis

logger = logging.getLogger("signalstack.analysis")
settings = get_settings()

MIN_SNIPPET_CHARS = 15
UNVERIFIED_STRENGTH_CAP = 0.2


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def snippet_is_verbatim(snippet: str, source_text: str) -> bool:
    needle = _normalise(snippet)
    if len(needle) < MIN_SNIPPET_CHARS:
        return False
    return needle in _normalise(source_text)


def apply_analysis(record: Record, analysis: Analysis, source: Source | None) -> dict:
    """Validate evidence, store analysis + scores, return the stored analysis dict."""
    verbatim = snippet_is_verbatim(analysis.evidence_snippet, record.text)
    strength = float(analysis.evidence_strength)
    if not verbatim:
        strength = min(strength, UNVERIFIED_STRENGTH_CAP)

    stored = analysis.model_dump()
    stored["evidence_verbatim"] = verbatim
    stored["evidence_strength"] = round(strength, 4)
    stored["strategic_relevance"] = round(float(analysis.strategic_relevance), 4)
    stored["source_reliability"] = round(float(source.reliability), 4) if source else 0.5
    stored["analysed_at"] = datetime.now(timezone.utc).isoformat()
    if not verbatim:
        stored["flag"] = "evidence snippet not found verbatim in the source text"

    scored = ranking.score_record(
        relevance=analysis.relevance,
        impact=analysis.impact,
        urgency=analysis.urgency,
        credibility=stored["source_reliability"],
        published=record.published,
        discovered=record.discovered,
        is_update=record.is_update,
    )
    stored["total"] = scored["total"]
    record.analysis = stored
    record.scores = {
        **scored["components"],
        "weights": scored["weights"],
        "total": scored["total"],
        "explanation": scored["explanation"],
    }
    record.total = scored["total"]
    return stored


def _prompt(company, record: Record, source: Source | None) -> str:
    intelligence = (company.profile or {}).get("intelligence") or {}
    priorities = "; ".join(
        item["answer"][:200] for item in intelligence.get("founder_answers", [])[:4]
    ) or "(no interview answers yet)"
    context = company.context or "(none)"
    category = source.category if source else "unknown"

    return (
        f"Company under monitoring: {company.name} ({company.website})\n"
        f"Founder context: {context}\n"
        f"Founder priorities from the interview: {priorities}\n"
        f"Source category: {category}\n"
        f"Document URL: {record.url}\n"
        f"Document title: {record.title}\n\n"
        "Analyse the document below. Interpret it strictly; do not add outside knowledge.\n"
        "- evidence_snippet MUST be copied character for character from the document text.\n"
        "- Scores are 0..1: relevance (does this matter to this company), impact (size of the "
        "business consequence), urgency (how soon someone must act), strategic_relevance (link "
        "to the founder's stated priorities), evidence_strength (how directly the snippet proves "
        "the summary).\n"
        "- Classify the signal as one of: opportunity, threat, neutral, or uncertain.\n"
        "- If the document says nothing meaningful for this company, say so plainly and score low.\n\n"
        + llm.wrap_untrusted(record.url, record.text[:8000])
    )


def analyse_pending(db, company, *, limit: int | None = None, sleep_seconds: float | None = None) -> dict:
    """Analyse up to `limit` unanalysed records (default 40) with pauses for rate limits."""
    cap = limit or settings.max_analyses_per_run
    pause = 1.0 if sleep_seconds is None else sleep_seconds

    rows = db.scalars(
        select(Record)
        .where(Record.company_id == company.id, Record.analysis.is_(None))
        .order_by(Record.id)
        .limit(cap)
    ).all()
    sources = {
        source.id: source
        for source in db.scalars(select(Source).where(Source.company_id == company.id)).all()
    }

    analysed, failed, flagged = 0, 0, 0
    errors: list[str] = []
    for record in rows:
        source = sources.get(record.source_id) if record.source_id else None
        try:
            result = llm.ask(_prompt(company, record, source), Analysis, max_tokens=1200)
        except Exception as exc:  # keep going; one bad record must not kill the run
            failed += 1
            errors.append(f"record {record.id}: {exc.__class__.__name__}")
            logger.warning("analysis failed for record %s: %s", record.id, exc.__class__.__name__)
            continue

        stored = apply_analysis(record, result, source)
        analysed += 1
        if not stored["evidence_verbatim"]:
            flagged += 1
        if pause:
            time.sleep(pause)

    db.commit()
    summary = {
        "company_id": company.id,
        "considered": len(rows),
        "analysed": analysed,
        "failed": failed,
        "evidence_flagged": flagged,
        "errors": errors[:10],
        "cap_per_run": cap,
    }
    db.add(
        JobLog(
            company_id=company.id,
            job="analyse",
            status="ok" if failed == 0 else ("partial" if analysed else "error"),
            detail=str(summary),
        )
    )
    db.commit()
    return summary
