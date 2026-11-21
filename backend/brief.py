"""Phase 6 - the Monday Morning Brief.

Eleven fixed sections. The model writes prose only: record selection, ranking,
headings and every citation check are done in code. Any record id the model
returns that is not in the database set passed to it is stripped; an action left
with no valid evidence is dropped.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select

import llm
from db import JobLog, Record, Report, Source
from schemas import BriefDraft

logger = logging.getLogger("signalstack.brief")

EMPTY_CATEGORY_SENTENCE = (
    "No meaningful verified development was identified during this monitoring period."
)
TOP_N = 5
MAX_RECORDS_IN_PROMPT = 25

SECTION_HEADINGS = [
    "Executive Summary",
    "Company Snapshot",
    "Customer Signals",
    "Competitor Moves",
    "Market & Regulatory Shifts",
    "Founder Intelligence",
    "Top Five Signals This Week",
    "Strategic Implications",
    "Risks & Watchlist",
    "Recommended Actions",
    "Sources & Method",
]

CATEGORY_TO_DRAFT_FIELD = {
    "customers": "customer_signals",
    "competitors": "competitor_moves",
    "market": "market_shifts",
    "internal": "founder_intelligence",
}


class BriefError(RuntimeError):
    pass


def _record_payload(record: Record, source: Source | None) -> dict:
    analysis = record.analysis or {}
    return {
        "id": record.id,
        "title": analysis.get("title") or record.title,
        "summary": analysis.get("summary", ""),
        "url": record.url,
        "category": (source.category if source else "internal"),
        "total": record.total,
        "published": record.published.isoformat() if record.published else None,
        "evidence_verbatim": analysis.get("evidence_verbatim"),
    }


def select_records(db, company, limit: int = MAX_RECORDS_IN_PROMPT) -> list[Record]:
    """Newest highest-scoring analysed records, deterministic ordering."""
    return list(
        db.scalars(
            select(Record)
            .where(Record.company_id == company.id, Record.analysis.is_not(None))
            .order_by(Record.total.desc(), Record.id.desc())
            .limit(limit)
        ).all()
    )


def _draft_prompt(company, records_payload: list[dict], profile: dict, counts: dict) -> str:
    intelligence = profile.get("intelligence") or {}
    answers = "\n".join(
        f"Q: {item['question']}\nA: {item['answer']}" for item in intelligence.get("founder_answers", [])[:8]
    ) or "(interview not completed)"
    records_json = json.dumps(records_payload, ensure_ascii=False, indent=1)

    return (
        f"Company: {company.name} ({company.website})\n"
        f"Profile summary: {profile.get('summary', '')}\n"
        f"Industry: {profile.get('industry', '')}\n"
        f"Founder context: {company.context or '(none)'}\n"
        f"Founder interview answers:\n{answers}\n\n"
        f"Verified record counts by category: {json.dumps(counts)}\n\n"
        "Write this week's Monday Morning Brief using ONLY the records below. Each section must "
        "cite the record ids it relies on. Do not introduce facts, names or numbers that are not "
        "in those records. If a category has no records, leave its body empty - code will insert "
        "the required sentence.\n"
        "- executive_summary: 5-8 sentences on what changed and why it matters, citing ids in "
        "executive_record_ids.\n"
        "- strategic_implications: what this means for the founder's stated priorities.\n"
        "- risks_watchlist: what could hurt the company, again only from the records.\n"
        "- opportunities: up to 6 structured opportunities (opportunity, evidence, relevance, "
        "impact, next_step, priority high|medium|low, record_ids) backed by cited records.\n"
        "- risks: up to 6 structured risks (risk, mitigation, record_ids) backed by cited records.\n"
        "- actions: at most 6 concrete actions, each citing the record ids that justify it. An "
        "action without evidence will be deleted.\n\n"
        + llm.wrap_untrusted("records", records_json)
    )


def _clean_ids(ids: list[int], valid: set[int]) -> list[int]:
    seen: list[int] = []
    for record_id in ids:
        if record_id in valid and record_id not in seen:
            seen.append(record_id)
    return seen


def build_content(
    company,
    draft: BriefDraft,
    records: list[Record],
    sources: dict[int, Source],
    *,
    counts: dict,
    dropped_actions: int,
) -> dict:
    valid = {record.id for record in records}
    payload_by_id = {record.id: _record_payload(record, sources.get(record.source_id)) for record in records}
    by_category: dict[str, list[Record]] = {category: [] for category in CATEGORY_TO_DRAFT_FIELD}
    for record in records:
        source = sources.get(record.source_id) if record.source_id else None
        category = source.category if source and source.category in by_category else "internal"
        by_category[category].append(record)

    sections: list[dict] = []

    executive_ids = _clean_ids(draft.executive_record_ids, valid)
    sections.append(
        {
            "key": "executive_summary",
            "heading": SECTION_HEADINGS[0],
            "body": draft.executive_summary.strip()
            or "No verified developments to summarise for this period.",
            "record_ids": executive_ids,
        }
    )

    profile = company.profile or {}
    snapshot = profile.get("summary", "")
    facts = []
    for key in ("products", "customers", "geography", "differentiators"):
        for fact in profile.get(key, [])[:3]:
            facts.append(f"{fact['text']} ({fact['evidence_url']})")
    snapshot_body = snapshot + ("\n\nVerified facts:\n" + "\n".join(f"- {line}" for line in facts) if facts else "")
    unverified = profile.get("unverified", [])
    if unverified:
        snapshot_body += "\n\nUnverified (hypotheses, not facts):\n" + "\n".join(f"- {item}" for item in unverified[:8])
    sections.append(
        {
            "key": "company_snapshot",
            "heading": SECTION_HEADINGS[1],
            "body": snapshot_body.strip() or "No company profile stored yet.",
            "record_ids": [],
        }
    )

    for index, (category, field) in enumerate(CATEGORY_TO_DRAFT_FIELD.items(), start=2):
        prose = getattr(draft, field)
        category_records = by_category.get(category, [])
        ids = _clean_ids(prose.record_ids, valid)
        if not category_records or not ids:
            body = EMPTY_CATEGORY_SENTENCE
            ids = []
        else:
            body = prose.body.strip() or EMPTY_CATEGORY_SENTENCE
            if not prose.body.strip():
                ids = []
        sections.append(
            {"key": field, "heading": SECTION_HEADINGS[index], "body": body, "record_ids": ids}
        )

    top = sorted(records, key=lambda record: (-record.total, -record.id))[:TOP_N]
    top_lines = []
    for rank, record in enumerate(top, start=1):
        payload = payload_by_id[record.id]
        explanation = (record.scores or {}).get("explanation", "")
        top_lines.append(
            f"{rank}. {payload['title']} — score {record.total:.1f}/100 (record {record.id}, "
            f"{payload['category']}) {payload['url']}\n   {payload['summary']}\n   Why it ranks here: {explanation}"
        )
    sections.append(
        {
            "key": "top_signals",
            "heading": SECTION_HEADINGS[6],
            "body": "\n\n".join(top_lines) if top_lines else EMPTY_CATEGORY_SENTENCE,
            "record_ids": [record.id for record in top],
        }
    )

    implications = draft.strategic_implications
    implication_ids = _clean_ids(implications.record_ids, valid)
    sections.append(
        {
            "key": "strategic_implications",
            "heading": SECTION_HEADINGS[7],
            "body": implications.body.strip() if implication_ids else EMPTY_CATEGORY_SENTENCE,
            "record_ids": implication_ids,
        }
    )

    risks = draft.risks_watchlist
    risk_ids = _clean_ids(risks.record_ids, valid)
    sections.append(
        {
            "key": "risks_watchlist",
            "heading": SECTION_HEADINGS[8],
            "body": risks.body.strip() if risk_ids else EMPTY_CATEGORY_SENTENCE,
            "record_ids": risk_ids,
        }
    )

    opportunities = []
    for item in draft.opportunities:
        ids = _clean_ids(item.record_ids, valid)
        if not ids:
            continue
        opportunities.append(
            {
                "opportunity": item.opportunity.strip(),
                "evidence": item.evidence.strip(),
                "relevance": item.relevance.strip(),
                "impact": item.impact.strip(),
                "next_step": item.next_step.strip(),
                "priority": item.priority,
                "record_ids": ids,
            }
        )

    structured_risks = []
    for item in draft.risks:
        ids = _clean_ids(item.record_ids, valid)
        if not ids:
            continue
        structured_risks.append(
            {
                "risk": item.risk.strip(),
                "mitigation": item.mitigation.strip(),
                "record_ids": ids,
            }
        )

    actions = []
    for action in draft.actions:
        ids = _clean_ids(action.record_ids, valid)
        if not ids:
            continue  # PRD: actions without valid evidence are dropped
        actions.append(
            {
                "action": action.action.strip(),
                "owner": action.owner.strip() or "Founder",
                "why": action.why.strip(),
                "record_ids": ids,
                "done": False,
            }
        )
    sections.append(
        {
            "key": "actions",
            "heading": SECTION_HEADINGS[9],
            "body": "" if actions else EMPTY_CATEGORY_SENTENCE,
            "record_ids": sorted({record_id for action in actions for record_id in action["record_ids"]}),
        }
    )

    source_rows = []
    for source in sources.values():
        used = [record.id for record in records if record.source_id == source.id]
        source_rows.append(
            {
                "id": source.id,
                "name": source.name,
                "url": source.url,
                "category": source.category,
                "reliability": source.reliability,
                "records_used": used,
            }
        )
    method_body = (
        f"{len(records)} analysed records were available; {counts.get('sources', 0)} approved sources "
        f"were crawled. Record counts by category: {json.dumps({k: len(v) for k, v in by_category.items()})}. "
        f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} with {llm.settings.groq_model}. "
        "Every citation id in this brief exists in the database; citation ids the model returned but "
        "that could not be verified were removed. Scores are deterministic (see ranking.py)."
        + (f" {dropped_actions} proposed action(s) were dropped for lacking valid evidence." if dropped_actions else "")
    )
    sections.append(
        {
            "key": "sources_method",
            "heading": SECTION_HEADINGS[10],
            "body": method_body,
            "record_ids": sorted({record.id for record in records}),
        }
    )

    return {
        "company": {"id": company.id, "name": company.name, "website": company.website},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sections": sorted(sections, key=lambda item: SECTION_HEADINGS.index(item["heading"])),
        "top_signals": [payload_by_id[record.id] for record in top],
        "opportunities": opportunities,
        "risks": structured_risks,
        "actions": actions,
        "counts": counts,
        "sources": source_rows,
        "record_index": [
            {"id": record.id, "url": record.url, "title": payload_by_id[record.id]["title"]}
            for record in records
        ],
        "dropped_actions": dropped_actions,
        "model": llm.settings.groq_model,
    }


def render_markdown(content: dict) -> str:
    lines = [
        f"# Monday Morning Brief — {content['company']['name']}",
        f"_{content['generated_at']} · {content['company']['website']}_",
        "",
    ]
    for section in content["sections"]:
        lines.append(f"## {section['heading']}")
        if section["key"] == "actions" and content["actions"]:
            for action in content["actions"]:
                mark = "x" if action.get("done") else " "
                cites = ", ".join(f"record {rid}" for rid in action["record_ids"])
                lines.append(
                    f"- [{mark}] **{action['action']}** — owner {action['owner']} "
                    f"({cites}){' — ' + action['why'] if action['why'] else ''}"
                )
        elif section["body"]:
            lines.append(section["body"])
        if section["key"] == "strategic_implications" and content.get("opportunities"):
            lines.append("")
            lines.append("### Structured Opportunities")
            for opp in content["opportunities"]:
                cites = ", ".join(f"record {rid}" for rid in opp["record_ids"])
                lines.append(
                    f"- **[{opp['priority'].upper()}] {opp['opportunity']}** ({cites})"
                    + (f" — Next: {opp['next_step']}" if opp.get("next_step") else "")
                )
        if section["key"] == "risks_watchlist" and content.get("risks"):
            lines.append("")
            lines.append("### Risks & Mitigations")
            for item in content["risks"]:
                cites = ", ".join(f"record {rid}" for rid in item["record_ids"])
                lines.append(
                    f"- **{item['risk']}** ({cites})"
                    + (f" — Mitigation: {item['mitigation']}" if item.get("mitigation") else "")
                )
        if section["record_ids"]:
            lines.append("")
            lines.append("Citations: " + ", ".join(f"record {rid}" for rid in section["record_ids"]))
        lines.append("")
    if content.get("record_index"):
        lines.append("## Record index")
        for item in content["record_index"]:
            lines.append(f"- record {item['id']}: [{item['title'] or item['url']}]({item['url']})")
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def generate(db, company) -> Report:
    records = select_records(db, company)
    if not records:
        raise BriefError(
            "No analysed records yet. Crawl approved sources and run analysis before generating a brief."
        )

    sources = {
        source.id: source
        for source in db.scalars(select(Source).where(Source.company_id == company.id)).all()
    }
    counts_by_category: dict[str, int] = {}
    for record in records:
        source = sources.get(record.source_id) if record.source_id else None
        category = source.category if source else "internal"
        counts_by_category[category] = counts_by_category.get(category, 0) + 1
    counts = {
        "records": len(records),
        "sources": sum(1 for source in sources.values() if source.status == "approved"),
        "by_category": counts_by_category,
    }

    payload = [_record_payload(record, sources.get(record.source_id)) for record in records]
    draft = llm.ask(
        _draft_prompt(company, payload, company.profile or {}, counts),
        BriefDraft,
        max_tokens=3500,
        temperature=0.3,
    )

    proposed_actions = len(draft.actions)
    content = build_content(company, draft, records, sources, counts=counts, dropped_actions=0)
    content["dropped_actions"] = proposed_actions - len(content["actions"])
    if content["dropped_actions"]:
        # rebuild so the Sources & Method sentence reflects the real number
        content = build_content(
            company, draft, records, sources, counts=counts, dropped_actions=content["dropped_actions"]
        )

    markdown = render_markdown(content)
    report = Report(company_id=company.id, content=content, markdown=markdown)
    db.add(report)
    db.flush()

    cited: set[int] = set()
    for section in content["sections"]:
        cited.update(section["record_ids"])
    for action in content["actions"]:
        cited.update(action["record_ids"])
    for item in content.get("opportunities", []):
        cited.update(item["record_ids"])
    for item in content.get("risks", []):
        cited.update(item["record_ids"])
    missing = [record_id for record_id in cited if db.get(Record, record_id) is None]
    if missing:  # defence in depth: never persist a brief with a dangling citation
        db.rollback()
        raise BriefError(f"internal error: citation ids not found in database: {missing}")

    db.add(
        JobLog(
            company_id=company.id,
            job="brief",
            status="ok",
            detail=json.dumps({"report_id": report.id, "records": len(records), "citations": len(cited)}),
        )
    )
    db.commit()
    db.refresh(report)
    return report
