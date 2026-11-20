"""Phase 8a - context reassessment.

When the founder's context changes, every source is re-scored against the new
context in one LLM call. Sources below 0.4 are *recommended* for removal with a
reason and left in place: only a human approves deletion.
"""

from __future__ import annotations

import json
import logging

from pydantic import BaseModel, Field
from sqlalchemy import select

import discovery
import llm
from db import JobLog, Source

logger = logging.getLogger("signalstack.context")

REMOVAL_THRESHOLD = 0.4


class RelevanceItem(BaseModel):
    source_id: int
    relevance: float = Field(ge=0.0, le=1.0)
    reason: str = ""


class RelevanceBatch(BaseModel):
    items: list[RelevanceItem] = Field(default_factory=list)


def _prompt(company, new_context: str, sources: list[Source]) -> str:
    rows = [
        {
            "source_id": source.id,
            "name": source.name,
            "url": source.url,
            "category": source.category,
            "why_it_was_added": source.reason,
        }
        for source in sources
    ]
    return (
        f"Company: {company.name} ({company.website})\n"
        f"Previous context: {company.context or '(none)'}\n"
        f"New context: {new_context}\n\n"
        "Re-score how relevant each monitoring source is to the NEW context. 0 means irrelevant, "
        "1 means essential. Give one short reason each, and be strict: sources that only mattered "
        "for the old context should score low.\n\n"
        + llm.wrap_untrusted("sources", json.dumps(rows, ensure_ascii=False, indent=1))
    )


def reassess(db, company, new_context: str, *, run_discovery: bool = True) -> dict:
    new_context = (new_context or "").strip()
    if not new_context:
        raise ValueError("new_context must not be empty")

    previous_context = company.context
    company.context = new_context
    db.flush()

    sources = list(
        db.scalars(
            select(Source).where(
                Source.company_id == company.id, Source.status.in_(("pending", "approved"))
            )
        ).all()
    )
    if not sources:
        db.commit()
        return {
            "company_id": company.id,
            "previous_context": previous_context,
            "new_context": new_context,
            "scored": 0,
            "updated": [],
            "recommended_removal": [],
            "discovery": None,
            "message": "no sources to score yet",
        }

    result = llm.ask(_prompt(company, new_context, sources), RelevanceBatch, max_tokens=2500)
    valid_ids = {source.id for source in sources}
    by_id = {source.id: source for source in sources}

    updated: list[dict] = []
    recommended: list[dict] = []
    for item in result.items:
        if item.source_id not in valid_ids:
            continue  # model invented a source id: ignored
        source = by_id[item.source_id]
        previous = source.relevance
        source.relevance = round(float(item.relevance), 3)
        source.relevance_reason = item.reason.strip()[:900]
        entry = {
            "source_id": source.id,
            "name": source.name,
            "category": source.category,
            "previous_relevance": previous,
            "relevance": source.relevance,
            "reason": source.relevance_reason,
            "changed": previous is None or abs((previous or 0) - source.relevance) >= 0.05,
        }
        updated.append(entry)
        if source.relevance < REMOVAL_THRESHOLD:
            recommended.append({**entry, "action": "recommend removal - needs user approval"})

    db.commit()

    discovery_result = None
    if run_discovery:
        try:
            discovery_result = discovery.discover(db, company)
            discovery_result = {
                "created_count": discovery_result["created_count"],
                "dropped_count": discovery_result["dropped_count"],
                "counts_by_category": discovery_result["counts_by_category"],
            }
        except discovery.DiscoveryError as exc:
            discovery_result = {"error": str(exc)}
        except Exception as exc:  # a failed discovery must not lose the rescoring
            logger.warning("discovery after reassessment failed: %s", exc.__class__.__name__)
            discovery_result = {"error": exc.__class__.__name__}

    summary = {
        "company_id": company.id,
        "previous_context": previous_context,
        "new_context": new_context,
        "scored": len(updated),
        "changed_count": sum(1 for item in updated if item["changed"]),
        "updated": updated,
        "recommended_removal": recommended,
        "discovery": discovery_result,
        "threshold": REMOVAL_THRESHOLD,
    }
    db.add(
        JobLog(
            company_id=company.id,
            job="context_reassess",
            status="ok",
            detail=json.dumps(
                {
                    "scored": summary["scored"],
                    "changed": summary["changed_count"],
                    "recommended_removal": len(recommended),
                }
            ),
        )
    )
    db.commit()
    return summary
