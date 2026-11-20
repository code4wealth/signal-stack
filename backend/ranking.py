"""Phase 5 - deterministic ranking (PRD section 9).

Weight x component, all components normalised to 0..1, score scaled to 0..100.
Only recency, credibility and novelty are derived here; relevance, impact and
urgency come from the stored LLM analysis. Every record keeps its components and
a human-readable explanation string.
"""

from __future__ import annotations

from datetime import datetime, timezone

WEIGHTS = {
    "relevance": 0.25,
    "impact": 0.25,
    "urgency": 0.15,
    "credibility": 0.15,
    "recency": 0.10,
    "novelty": 0.10,
}
RECENCY_WINDOW_DAYS = 30


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def recency_component(published: datetime | None, discovered: datetime | None, now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    reference = _as_utc(published) or _as_utc(discovered) or now
    age_days = max(0.0, (now - reference).total_seconds() / 86400.0)
    return max(0.0, 1.0 - age_days / RECENCY_WINDOW_DAYS)


def novelty_component(is_update: bool) -> float:
    return 0.3 if is_update else 1.0


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def score_record(
    *,
    relevance: float,
    impact: float,
    urgency: float,
    credibility: float,
    published: datetime | None,
    discovered: datetime | None,
    is_update: bool,
    now: datetime | None = None,
) -> dict:
    components = {
        "relevance": _clamp(relevance),
        "impact": _clamp(impact),
        "urgency": _clamp(urgency),
        "credibility": _clamp(credibility),
        "recency": _clamp(recency_component(published, discovered, now)),
        "novelty": _clamp(novelty_component(is_update)),
    }
    total = round(100.0 * sum(WEIGHTS[key] * value for key, value in components.items()), 2)
    return {
        "components": components,
        "weights": dict(WEIGHTS),
        "total": total,
        "explanation": explain(components, total, is_update),
    }


def explain(components: dict[str, float], total: float, is_update: bool) -> str:
    parts = [
        f"{key} {value:.2f} (weight {WEIGHTS[key]:.2f}, contribution {WEIGHTS[key] * value * 100:.1f})"
        for key, value in components.items()
    ]
    note = "update of an existing document, novelty reduced" if is_update else "new document"
    return f"Score {total:.2f}/100 = " + " + ".join(parts) + f"; {note}."


def rank_explanation(record) -> str | None:
    """Read back the stored explanation for the API/UI."""
    scores = record.scores or {}
    return scores.get("explanation")


def rescore(db, company_id: int, now: datetime | None = None) -> int:
    """Recompute every scored record for a company (e.g. after a reliability edit)."""
    from sqlalchemy import select

    from db import Record, Source

    rows = db.scalars(select(Record).where(Record.company_id == company_id)).all()
    sources = {
        source.id: source
        for source in db.scalars(select(Source).where(Source.company_id == company_id)).all()
    }
    changed = 0
    for record in rows:
        analysis = record.analysis or {}
        if not analysis:
            continue
        source = sources.get(record.source_id) if record.source_id else None
        scored = score_record(
            relevance=analysis.get("relevance", 0.0),
            impact=analysis.get("impact", 0.0),
            urgency=analysis.get("urgency", 0.0),
            credibility=source.reliability if source else 0.5,
            published=record.published,
            discovered=record.discovered,
            is_update=record.is_update,
            now=now,
        )
        record.scores = scored["components"] | {"weights": scored["weights"], "total": scored["total"], "explanation": scored["explanation"]}
        record.total = scored["total"]
        changed += 1
    db.commit()
    return changed
