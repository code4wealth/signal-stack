"""Phase 3 - adaptive founder interview.

Ten company-specific questions generated from the research profile, answered one
at a time. A follow-up is offered only when an answer is too vague, at most three
per interview, and never a repeat of a question already asked. Everything lives
in the `qa` table and `company.profile["interview_meta"]` so a server restart
loses nothing.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from sqlalchemy import select

from config import get_settings
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

AREA_TOPICS = (
    "Goals",
    "Customers",
    "Operations",
    "Growth",
    "Competitors",
    "Market",
    "Competitors",
    "Operations",
    "Goals",
    "Market",
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

VALID_TOPICS = {"Customers", "Growth", "Competitors", "Market", "Operations", "Goals"}


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


def _normalise_topic(raw: str | None, idx: int) -> str:
    if raw:
        cleaned = raw.strip().title()
        if cleaned in VALID_TOPICS:
            return cleaned
    return AREA_TOPICS[idx] if 0 <= idx < len(AREA_TOPICS) else "Goals"


def _summarize_answer_for_learned(answer_text: str) -> str:
    """Create a concise verbatim-grounded summary sentence from the founder's answer."""
    clean = " ".join(answer_text.strip().split())
    if len(clean) <= 160:
        return clean
    first_sentence = re.split(r"(?<=[.!?])\s+", clean, maxsplit=1)[0]
    if 24 <= len(first_sentence) <= 180:
        return first_sentence
    return clean[:157].rstrip() + "..."


def _generate_questions(company, profile: dict) -> list[dict]:
    import llm

    summary = profile.get("summary", "")
    industry = profile.get("industry", "")
    competitors = ", ".join(hint.get("name", "") for hint in profile.get("likely_competitors", [])) or "(unknown)"
    pages_fetched = (profile.get("_meta") or {}).get("pages_fetched", [])
    pages_str = ", ".join(pages_fetched[:6]) or company.website
    context = company.context or "(none supplied)"

    prompt = (
        f"Company: {company.name}\n"
        f"What the research found (already verified from their site): {summary}\n"
        f"Industry: {industry or 'unclear'}\n"
        f"Possible competitors: {competitors}\n"
        f"Fetched page URLs available to cite: {pages_str}\n"
        f"Founder context: {context}\n\n"
        f"Write exactly {QUESTION_COUNT} interview questions for the founder, one per area below, "
        "in this order. Each question must be specific to this company (use its actual products, "
        "customers or geography where the profile supports it) and must be answerable in 2-4 "
        "sentences. No yes/no questions, no multi-part questions, no repeats.\n"
        "For each item also provide:\n"
        "- topic: one of Customers, Growth, Competitors, Market, Operations, Goals\n"
        "- why_asking: 1 short sentence citing what public research showed\n"
        "- evidence_urls: 1-2 URLs strictly from the fetched page URLs above\n"
        "- suggested_answers: 0-2 short draft starting points strictly grounded in the profile (or [] if unknown)\n\n"
        "Areas:\n"
        + "\n".join(f"{i + 1}. {area}" for i, area in enumerate(QUESTION_AREAS))
    )

    best: list[dict] = []
    valid_urls = set(pages_fetched)
    for _attempt in range(2):
        batch = llm.ask(prompt, QuestionBatch, max_tokens=2200, temperature=0.4)
        unique: list[dict] = []
        for item in batch.questions:
            q_text = item.question.strip()
            if not q_text:
                continue
            if any(questions_are_similar(q_text, seen["question"]) for seen in unique):
                continue
            cited = [u for u in item.evidence_urls if u in valid_urls][:2]
            if not cited and pages_fetched:
                cited = [pages_fetched[0]]
            unique.append(
                {
                    "question": q_text,
                    "topic": _normalise_topic(item.topic, len(unique)),
                    "why_asking": item.why_asking.strip(),
                    "evidence_urls": cited,
                    "suggested_answers": [s.strip() for s in item.suggested_answers if s.strip()][:3],
                }
            )
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


def _get_meta(company) -> dict:
    return dict(((company.profile or {}).get("interview_meta")) or {})


def _set_meta(company, meta: dict) -> None:
    profile = dict(company.profile or {})
    profile["interview_meta"] = meta
    company.profile = profile


def state(db, company, regenerated_from: int | None = None) -> dict:
    rows = _ordered(db, company.id)
    current = next((row for row in rows if row.answer is None and not row.skipped), None)
    profile = company.profile or {}
    intelligence = profile.get("intelligence") or {}
    meta = _get_meta(company)
    turns_meta = meta.get("turns") or {}
    pages_fetched = (profile.get("_meta") or {}).get("pages_fetched") or []

    completed = bool(intelligence.get("completed_at"))
    started = bool(rows)
    status = "completed" if completed else ("in_progress" if started else "not_started")

    turns = []
    learned = []
    for row in rows:
        t_meta = turns_meta.get(str(row.id)) or turns_meta.get(str(row.idx)) or {}
        topic = _normalise_topic(t_meta.get("topic"), row.idx)
        why_asking = t_meta.get("why_asking") or ""
        evidence_urls = list(t_meta.get("evidence_urls") or [])
        if not evidence_urls and pages_fetched:
            evidence_urls = [pages_fetched[0]]

        answer_obj = None
        if row.skipped or row.answer is not None:
            answer_obj = {
                "text": row.answer,
                "skipped": row.skipped,
                "quotedText": t_meta.get("quoted_text"),
                "editedAt": t_meta.get("edited_at"),
                "answeredAt": t_meta.get("answered_at") or row.created.isoformat(),
            }

        if row.answer:
            learned.append(
                {
                    "id": f"learned-{row.id}",
                    "topic": topic,
                    "text": _summarize_answer_for_learned(row.answer),
                    "sourceTurnIndex": row.idx,
                    "skipped": False,
                }
            )
        elif row.skipped:
            learned.append(
                {
                    "id": f"learned-{row.id}",
                    "topic": topic,
                    "text": "Skipped (confidential)",
                    "sourceTurnIndex": row.idx,
                    "skipped": True,
                }
            )

        turns.append(
            {
                "id": row.id,
                "index": row.idx,
                "question": row.question,
                "topic": topic,
                "whyAsking": why_asking or None,
                "evidenceIds": evidence_urls,
                "suggestedAnswers": t_meta.get("suggested_answers") or [],
                "isFollowup": row.is_followup,
                "answer": answer_obj,
                "updatedAfterEdit": bool(
                    regenerated_from is not None and row.idx >= regenerated_from
                ),
            }
        )

    settings = get_settings()
    model_name = meta.get("model") or (settings.groq_model if settings.groq_api_key else None)

    return {
        # Legacy fields preserved for full compatibility
        "company_id": company.id,
        "started": started,
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
        "completed": completed,
        # Extended contract for Adaptive AI Interview UI
        "id": company.id,
        "companyId": company.id,
        "status": status,
        "totalQuestions": max(len(rows), QUESTION_COUNT) if started else QUESTION_COUNT,
        "currentIndex": current.idx if current else (len(rows) if started else 0),
        "model": model_name,
        "turns": turns,
        "learned": learned,
        "regeneratedFrom": regenerated_from,
    }


def start(db, company) -> dict:
    """Generate the question set once. Calling again resumes the same interview."""
    if _ordered(db, company.id):
        return state(db, company)

    profile = company.profile or {}
    if not profile.get("summary"):
        raise InterviewError("Run company research before starting the interview.")

    items = _generate_questions(company, profile)
    qa_rows: list[QA] = []
    for idx, item in enumerate(items):
        qa = QA(company_id=company.id, idx=idx, question=item["question"], is_followup=False)
        db.add(qa)
        qa_rows.append(qa)
    db.flush()

    settings = get_settings()
    meta = _get_meta(company)
    turns_meta = dict(meta.get("turns") or {})
    for qa, item in zip(qa_rows, items):
        turns_meta[str(qa.id)] = {
            "topic": item["topic"],
            "why_asking": item["why_asking"],
            "evidence_urls": item["evidence_urls"],
            "suggested_answers": item["suggested_answers"],
        }
    meta["turns"] = turns_meta
    if settings.groq_api_key:
        meta["model"] = settings.groq_model
    _set_meta(company, meta)

    db.commit()
    db.refresh(company)
    return state(db, company)


def _insert_followup(
    db, company, after_idx: int, question: str, topic: str = "", why_asking: str = ""
) -> QA:
    """Shift later rows down so display order stays natural."""
    for row in _ordered(db, company.id):
        if row.idx > after_idx:
            row.idx += 1
    qa = QA(company_id=company.id, idx=after_idx + 1, question=question, is_followup=True)
    db.add(qa)
    db.flush()

    meta = _get_meta(company)
    turns_meta = dict(meta.get("turns") or {})
    turns_meta[str(qa.id)] = {
        "topic": _normalise_topic(topic, after_idx + 1),
        "why_asking": why_asking or "Following up to clarify specifics from your previous answer.",
        "evidence_urls": [],
        "suggested_answers": [],
    }
    meta["turns"] = turns_meta
    _set_meta(company, meta)
    return qa


def _maybe_followup(db, company, row: QA, answer_text: str) -> FollowUpDecision | None:
    import llm

    rows = _ordered(db, company.id)
    used = sum(1 for item in rows if item.is_followup)
    if used >= MAX_FOLLOWUPS:
        return None

    existing = [item.question for item in rows]
    prompt = (
        f"Interview question: {row.question}\n"
        f"Founder's answer: {answer_text}\n\n"
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
    return decision


def answer(
    db,
    company,
    idx: int,
    text: str | None,
    skip: bool = False,
    quoted_text: str | None = None,
) -> dict:
    rows = _ordered(db, company.id)
    if not rows:
        raise InterviewError("Interview not started. Call /interview/start first.")
    row = next((item for item in rows if item.idx == idx), None)
    if row is None:
        raise LookupError(f"no question at idx {idx}")
    if row.answer is not None or row.skipped:
        raise InterviewError(f"question {idx} is already answered; use PATCH to edit it")

    now_iso = datetime.now(timezone.utc).isoformat()
    meta = _get_meta(company)
    turns_meta = dict(meta.get("turns") or {})
    t_meta = dict(turns_meta.get(str(row.id)) or {})
    t_meta["answered_at"] = now_iso
    if quoted_text:
        t_meta["quoted_text"] = quoted_text.strip()
    turns_meta[str(row.id)] = t_meta
    meta["turns"] = turns_meta
    _set_meta(company, meta)

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
    decision = None
    if is_vague(row.answer):
        try:
            decision = _maybe_followup(db, company, row, row.answer)
        except Exception as exc:  # an LLM hiccup must not lose the answer
            logger.warning(
                "follow-up generation failed for company %s: %s", company.id, exc.__class__.__name__
            )
            decision = None
    if decision:
        _insert_followup(
            db,
            company,
            row.idx,
            decision.question.strip(),
            topic=decision.topic,
            why_asking=decision.why_asking,
        )

    db.commit()
    db.refresh(company)
    return state(db, company)


def edit_answer(db, company, qa_id: int, text: str) -> dict:
    row = db.get(QA, qa_id)
    if row is None or row.company_id != company.id:
        raise LookupError(f"answer {qa_id} not found for this company")
    return _apply_edit(db, company, row, text)


def edit_answer_by_turn(db, company, turn_index: int, text: str) -> dict:
    rows = _ordered(db, company.id)
    row = next((item for item in rows if item.idx == turn_index), None)
    if row is None:
        raise LookupError(f"turn {turn_index} not found for this company")
    return _apply_edit(db, company, row, text)


def _apply_edit(db, company, row: QA, text: str) -> dict:
    cleaned = text.strip()
    if not cleaned:
        raise InterviewError("answer text cannot be blank")
    row.answer = cleaned
    row.skipped = False

    now_iso = datetime.now(timezone.utc).isoformat()
    meta = _get_meta(company)
    turns_meta = dict(meta.get("turns") or {})
    t_meta = dict(turns_meta.get(str(row.id)) or {})
    t_meta["edited_at"] = now_iso
    if not t_meta.get("answered_at"):
        t_meta["answered_at"] = now_iso
    turns_meta[str(row.id)] = t_meta
    meta["turns"] = turns_meta
    _set_meta(company, meta)

    db.commit()
    db.refresh(company)

    # Indicate downstream questions after this turn may have been informed by the edit
    rows = _ordered(db, company.id)
    has_later = any(r.idx > row.idx for r in rows)
    return state(db, company, regenerated_from=(row.idx + 1 if has_later else None))


def reset(db, company) -> dict:
    for row in _ordered(db, company.id):
        db.delete(row)
    profile = dict(company.profile or {})
    profile.pop("interview_meta", None)
    profile.pop("intelligence", None)
    company.profile = profile
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
