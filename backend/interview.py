"""Phase 3 - adaptive founder interview.

Ten company-specific questions generated from the research profile, answered one
at a time. A follow-up is offered only when an answer is too vague, at most three
per interview, and never a repeat of a question already asked. Everything lives
in the `qa` table so a server restart loses nothing.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from sqlalchemy import select

from db import QA
from schemas import FollowUpDecision, QuestionBatch

logger = logging.getLogger("signalstack.interview")

QUESTION_COUNT = 10
MAX_FOLLOWUPS = 3

VAGUE_MARKERS = (
    "not sure",
    "not certain",
    "maybe",
    "various",
    "lots of",
    "it depends",
    "don't know",
    "dont know",
    "no idea",
    "many things",
    "all kinds",
    "everything",
    "hard to say",
    "somewhat",
)

QUESTION_AREAS = (
    "positioning: what the company does that customers cannot easily get elsewhere",
    "ideal customer profile: who buys, who uses, who influences the purchase",
    "revenue model: pricing, contract length, expansion path",
    "go-to-market: the single channel that produces most new customers today",
    "competition: who they lose deals to and why",
    "market: regulation, technology or funding shifts that could reshape demand",
    "moat: durable advantages versus well-funded entrants",
    "internal constraints: the bottleneck that slows the company down now",
    "twelve-month priorities and the metric that matters most",
    "risk: the development in the next six months that would hurt most",
)


class InterviewError(RuntimeError):
    pass


def _ordered(db, company_id: int) -> list[QA]:
    return list(
        db.scalars(select(QA).where(QA.company_id == company_id).order_by(QA.idx, QA.id)).all()
    )


def _normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower()).strip()


def _tokens(text: str) -> set[str]:
    return {token for token in _normalise(text).split() if len(token) > 3}


def questions_are_similar(a: str, b: str) -> bool:
    """Jaccard token overlap; used to guarantee a follow-up never repeats a question."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return _normalise(a) == _normalise(b)
    return len(ta & tb) / len(ta | tb) >= 0.75


def is_vague(answer: str) -> bool:
    """Deterministic gate: only vague answers may trigger an LLM follow-up."""
    text = (answer or "").strip()
    if len(text.split()) < 8 or len(text) < 45:
        return True
    lowered = text.lower()
    return any(marker in lowered for marker in VAGUE_MARKERS)


def _generate_questions(company, profile: dict) -> list[str]:
    import llm

    summary = profile.get("summary", "")
    industry = profile.get("industry", "")
    competitors = ", ".join(hint.get("name", "") for hint in profile.get("likely_competitors", [])) or "(unknown)"
    context = company.context or "(none supplied)"

    prompt = (
        f"Company: {company.name}\n"
        f"What the research found (already verified from their site): {summary}\n"
        f"Industry: {industry or 'unclear'}\n"
        f"Possible competitors: {competitors}\n"
        f"Founder context: {context}\n\n"
        f"Write exactly {QUESTION_COUNT} interview questions for the founder, one per area below, "
        "in this order. Each question must be specific to this company (use its actual products, "
        "customers or geography where the profile supports it) and must be answerable in 2-4 "
        "sentences. No yes/no questions, no multi-part questions, no repeats.\n\n"
        "Areas:\n"
        + "\n".join(f"{i + 1}. {area}" for i, area in enumerate(QUESTION_AREAS))
    )

    best: list[str] = []
    for attempt in range(2):
        batch = llm.ask(prompt, QuestionBatch, max_tokens=1600, temperature=0.4)
        questions = [item.question.strip() for item in batch.questions if item.question.strip()]
        unique: list[str] = []
        for question in questions:
            if not any(questions_are_similar(question, seen) for seen in unique):
                unique.append(question)
        if len(unique) > len(best):
            best = unique
        if len(best) >= QUESTION_COUNT:
            return best[:QUESTION_COUNT]
        prompt += (
            f"\n\nYour previous list had only {len(best)} usable questions. "
            f"Return exactly {QUESTION_COUNT} distinct questions."
        )

    raise InterviewError(
        f"LLM produced {len(best)} distinct questions, need {QUESTION_COUNT}. Try again."
    )


def state(db, company) -> dict:
    rows = _ordered(db, company.id)
    current = next((row for row in rows if row.answer is None and not row.skipped), None)
    intelligence = (company.profile or {}).get("intelligence") or {}
    return {
        "company_id": company.id,
        "started": bool(rows),
        "questions": [
            {
                "id": row.id,
                "idx": row.idx,
                "question": row.question,
                "answer": row.answer,
                "skipped": row.skipped,
                "is_followup": row.is_followup,
            }
            for row in rows
        ],
        "current_idx": current.idx if current else None,
        "answered": sum(1 for row in rows if row.answer),
        "skipped": sum(1 for row in rows if row.skipped),
        "followups_used": sum(1 for row in rows if row.is_followup),
        "max_followups": MAX_FOLLOWUPS,
        "completed": bool(intelligence.get("completed_at")),
    }


def start(db, company) -> dict:
    """Generate the question set once. Calling again resumes the same interview."""
    if _ordered(db, company.id):
        return state(db, company)

    profile = (company.profile or {})
    if not profile.get("summary"):
        raise InterviewError("Run company research before starting the interview.")

    questions = _generate_questions(company, profile)
    for idx, question in enumerate(questions):
        db.add(QA(company_id=company.id, idx=idx, question=question, is_followup=False))
    db.commit()
    db.refresh(company)
    return state(db, company)


def _insert_followup(db, company_id: int, after_idx: int, question: str) -> None:
    """Shift later rows down so display order stays natural."""
    for row in _ordered(db, company_id):
        if row.idx > after_idx:
            row.idx += 1
    db.add(QA(company_id=company_id, idx=after_idx + 1, question=question, is_followup=True))
    db.flush()


def _maybe_followup(db, company, row: QA, answer: str) -> str | None:
    import llm

    rows = _ordered(db, company.id)
    used = sum(1 for item in rows if item.is_followup)
    if used >= MAX_FOLLOWUPS:
        return None

    existing = [item.question for item in rows]
    prompt = (
        f"Interview question: {row.question}\n"
        f"Founder's answer: {answer}\n\n"
        "Is this answer too vague to be useful for company intelligence? If yes, write one "
        "short follow-up that asks for the missing specific, and do not repeat the original "
        "question or any question already asked below.\n"
        "Already asked:\n" + "\n".join(f"- {q}" for q in existing)
    )
    decision = llm.ask(prompt, FollowUpDecision, max_tokens=400, temperature=0.3)
    if not decision.followup or not decision.question.strip():
        return None
    if any(questions_are_similar(decision.question, q) for q in existing):
        logger.info("rejected duplicate follow-up for company %s", company.id)
        return None
    return decision.question.strip()


def answer(db, company, idx: int, text: str | None, skip: bool = False) -> dict:
    rows = _ordered(db, company.id)
    if not rows:
        raise InterviewError("Interview not started. Call /interview/start first.")
    row = next((item for item in rows if item.idx == idx), None)
    if row is None:
        raise LookupError(f"no question at idx {idx}")
    if row.answer is not None or row.skipped:
        raise InterviewError(f"question {idx} is already answered; use PATCH to edit it")

    if skip:
        row.skipped = True
        row.answer = None
        db.commit()
        db.refresh(company)
        return state(db, company)

    if not text or not text.strip():
        raise InterviewError("answer text is empty; pass skip=true to skip")

    row.answer = text.strip()
    db.flush()
    followup = None
    if is_vague(row.answer):
        try:
            followup = _maybe_followup(db, company, row, row.answer)
        except Exception as exc:  # an LLM hiccup must not lose the answer
            logger.warning(
                "follow-up generation failed for company %s: %s", company.id, exc.__class__.__name__
            )
            followup = None
    if followup:
        _insert_followup(db, company.id, row.idx, followup)

    db.commit()
    db.refresh(company)
    return state(db, company)


def edit_answer(db, company, qa_id: int, text: str) -> dict:
    row = db.get(QA, qa_id)
    if row is None or row.company_id != company.id:
        raise LookupError(f"answer {qa_id} not found for this company")
    row.answer = text.strip()
    row.skipped = False
    db.commit()
    db.refresh(company)
    return state(db, company)


def complete(db, company) -> dict:
    rows = _ordered(db, company.id)
    if not rows:
        raise InterviewError("Interview not started.")
    answered = [row for row in rows if row.answer]
    if not answered:
        raise InterviewError("No answers yet - answer or skip at least one question first.")

    intelligence = {
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "answered": len(answered),
        "skipped": sum(1 for row in rows if row.skipped),
        "followups": sum(1 for row in rows if row.is_followup),
        # Verbatim, so nothing is invented between the founder's words and analysis.
        "founder_answers": [
            {
                "question": row.question,
                "answer": row.answer,
                "is_followup": row.is_followup,
            }
            for row in rows
            if row.answer
        ],
        "skipped_questions": [row.question for row in rows if row.skipped],
    }
    profile = dict(company.profile or {})
    profile["intelligence"] = intelligence
    company.profile = profile
    db.commit()
    db.refresh(company)
    return intelligence
