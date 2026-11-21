"""Editorial Monday Morning Brief adapter, citation indexer, and generation state."""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import func, select
from sqlalchemy.orm import Session

import db as db_module
from db import AutomationRun, Company, JobLog, Record, Report, Source

logger = logging.getLogger("signalstack.brief_api")

CATEGORY_KEYS = ("customers", "competitors", "market", "internal")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _domain_of(url: str) -> str:
    if not url or url.startswith("upload://"):
        return "internal-upload"
    host = urlparse(url).hostname or url
    return host.replace("www.", "")


def _source_type_label(src: Source | None, url: str) -> str:
    if url.startswith("upload://") or (src and src.source_type == "upload"):
        return "Internal file"
    if src:
        st = (src.source_type or "").lower()
        if st == "rss":
            return "RSS feed"
        if st == "changelog":
            return "Changelog"
        if src.category == "competitors":
            return "Competitor site"
        if src.category == "customers":
            return "Forum / Reviews"
        if src.category == "market":
            return "News / Market"
    return "Webpage"


def _priority_from_score(total: float) -> int:
    if total >= 80:
        return 5
    if total >= 65:
        return 4
    if total >= 50:
        return 3
    if total >= 35:
        return 2
    return 1


def _classification_of(rec: Record, src: Source | None) -> str:
    a = rec.analysis or {}
    cls = str(a.get("classification") or "").lower()
    if cls in ("opportunity", "threat", "neutral"):
        return cls
    cat = src.category if src else "internal"
    if cat == "competitors":
        return "threat"
    if cat in ("customers", "market") and rec.total >= 55:
        return "opportunity"
    return "neutral"


def _confidence_of(rec: Record) -> str:
    a = rec.analysis or {}
    c = str(a.get("confidence") or "").lower()
    if c in ("high", "medium", "low"):
        return c
    if a.get("evidence_verbatim") and rec.total >= 60:
        return "high"
    if rec.total >= 40:
        return "medium"
    return "low"


def _impact_of(rec: Record) -> str:
    if rec.total >= 70:
        return "high"
    if rec.total >= 45:
        return "medium"
    return "low"


def email_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") or os.getenv("RESEND_API_KEY"))


def get_prerequisites(db: Session, company_id: int) -> dict[str, Any]:
    analysed_cnt = (
        db.scalar(
            select(func.count(Record.id)).where(
                Record.company_id == company_id,
                Record.analysis.is_not(None),
            )
        )
        or 0
    )
    crawl_cnt = (
        db.scalar(
            select(func.count(JobLog.id)).where(
                JobLog.company_id == company_id,
                JobLog.job.in_(("crawl", "crawl_run")),
                JobLog.status.in_(("ok", "completed", "partial")),
            )
        )
        or 0
    )
    auto_crawl_cnt = (
        db.scalar(
            select(func.count(AutomationRun.id)).where(
                AutomationRun.company_id == company_id,
                AutomationRun.job_type == "crawl",
                AutomationRun.status == "success",
            )
        )
        or 0
    )
    total_crawls = crawl_cnt + auto_crawl_cnt
    ready = analysed_cnt > 0
    reason = None
    if not ready:
        if total_crawls == 0:
            reason = "No completed crawl or analysed signals yet. Run a crawl and analyse signals first."
        else:
            reason = "No analysed signals yet. Run Signal analysis before generating your Monday Brief."
    return {
        "ready": ready,
        "reason": reason,
        "signalsCount": int(analysed_cnt),
        "completedCrawls": int(total_crawls),
    }


def _all_company_reports(db: Session, company_id: int) -> list[Report]:
    return list(
        db.scalars(
            select(Report)
            .where(Report.company_id == company_id)
            .order_by(Report.id.asc())
        ).all()
    )


def serialize_brief(
    db: Session,
    company: Company,
    report: Report,
    *,
    mark_read: bool = False,
) -> dict[str, Any]:
    content = dict(report.content or {})
    if mark_read and content.get("unread") is not False:
        content["unread"] = False
        report.content = content
        db.commit()

    all_reports = _all_company_reports(db, company.id)
    version_num = 1
    prev_report: Report | None = None
    for idx, r in enumerate(all_reports):
        if r.id == report.id:
            version_num = idx + 1
            if idx > 0:
                prev_report = all_reports[idx - 1]
            break

    created_dt = _aware(report.created) or _utcnow()
    week_start_dt = (created_dt - timedelta(days=created_dt.weekday())).date()
    week_end_dt = week_start_dt + timedelta(days=6)

    removed_ids = {str(x) for x in content.get("removed_item_ids", [])}

    # Gather all records and sources for this company for deterministic grounding
    records_by_id: dict[int, Record] = {
        rec.id: rec
        for rec in db.scalars(select(Record).where(Record.company_id == company.id)).all()
    }
    sources_by_id: dict[int, Source] = {
        src.id: src
        for src in db.scalars(select(Source).where(Source.company_id == company.id)).all()
    }

    # Citation allocator: preserves first-appearance numbering across the brief
    citation_map: dict[int, int] = {}
    citation_used_in: dict[int, list[dict[str, str]]] = {}

    def cite_records(rec_ids: list[int], section_label: str, item_id: str) -> list[int]:
        nums: list[int] = []
        for rid in rec_ids:
            if rid not in records_by_id:
                continue
            if rid not in citation_map:
                citation_map[rid] = len(citation_map) + 1
                citation_used_in[rid] = []
            num = citation_map[rid]
            if num not in nums:
                nums.append(num)
            entry = {"section": section_label, "itemId": item_id}
            if entry not in citation_used_in[rid]:
                citation_used_in[rid].append(entry)
        return nums

    def build_signal_item(
        rec: Record,
        *,
        section_label: str,
        prefix: str,
    ) -> dict[str, Any]:
        src = sources_by_id.get(rec.source_id) if rec.source_id else None
        a = rec.analysis or {}
        cat = src.category if src and src.category in CATEGORY_KEYS else "internal"
        item_id = f"{prefix}-{rec.id}"
        cites = cite_records([rec.id], section_label, item_id)
        verbatim = (a.get("evidence_verbatim") or "").strip()
        fact_text = verbatim or (a.get("summary") or rec.title or rec.url).strip()
        why_text = (
            (a.get("why_it_matters") or "").strip()
            or ((rec.scores or {}).get("explanation") or "").strip()
            or (a.get("summary") or "").strip()
        )
        act_obj = a.get("recommended_action") if isinstance(a.get("recommended_action"), dict) else None
        act_text = (act_obj.get("text") if act_obj else None) or a.get("action")
        return {
            "id": item_id,
            "signalId": str(rec.id),
            "category": cat,
            "classification": _classification_of(rec, src),
            "priority": _priority_from_score(rec.total),
            "headline": (a.get("title") or rec.title or _domain_of(rec.url)).strip(),
            "fact": {"text": fact_text, "citations": cites},
            "whyItMatters": {"text": why_text, "citations": cites},
            "impactLevel": _impact_of(rec),
            "action": {"text": str(act_text).strip(), "actionId": None} if act_text else None,
            "confidence": _confidence_of(rec),
        }

    # 1. Executive Summary (top 5 from content.top_signals or highest-scoring records)
    raw_top = content.get("top_signals") or []
    top_records: list[Record] = []
    for t in raw_top:
        rid = t.get("id") if isinstance(t, dict) else None
        if isinstance(rid, int) and rid in records_by_id:
            top_records.append(records_by_id[rid])
    if not top_records:
        top_records = sorted(
            [r for r in records_by_id.values() if r.analysis is not None],
            key=lambda r: (-r.total, -r.id),
        )[:5]

    exec_items: list[dict[str, Any]] = []
    for rec in top_records[:5]:
        item = build_signal_item(rec, section_label="Executive summary", prefix="exec")
        if item["id"] not in removed_ids and item["signalId"] not in removed_ids:
            exec_items.append(item)

    # 2-5. Category sections (customers, competitors, market, internal)
    raw_sections = {
        s.get("key"): s
        for s in content.get("sections", [])
        if isinstance(s, dict) and s.get("key")
    }
    draft_field_for_cat = {
        "customers": "customer_signals",
        "competitors": "competitor_moves",
        "market": "market_shifts",
        "internal": "founder_intelligence",
    }
    section_label_map = {
        "customers": "Customer signals",
        "competitors": "Competitor intelligence",
        "market": "Market intelligence",
        "internal": "Internal intelligence",
    }
    sections_out: list[dict[str, Any]] = []
    for cat in CATEGORY_KEYS:
        raw_sec = raw_sections.get(draft_field_for_cat[cat]) or {}
        sec_rids = [int(x) for x in raw_sec.get("record_ids", []) if isinstance(x, int) and x in records_by_id]
        # Also include analysed records belonging to this category (up to 6) if not already captured
        cat_records = [
            rec
            for rec in sorted(records_by_id.values(), key=lambda r: (-r.total, -r.id))
            if rec.analysis is not None
            and ((sources_by_id.get(rec.source_id).category if rec.source_id and rec.source_id in sources_by_id else "internal") == cat)
        ]
        if not sec_rids and cat_records:
            sec_rids = [r.id for r in cat_records[:5]]

        items = []
        for rid in sec_rids:
            rec = records_by_id[rid]
            built = build_signal_item(rec, section_label=section_label_map[cat], prefix=cat)
            if built["id"] not in removed_ids and built["signalId"] not in removed_ids:
                items.append(built)

        body = (raw_sec.get("body") or "").strip()
        summary_obj = None
        if items and body and "No meaningful verified development" not in body:
            cites = cite_records([int(i["signalId"]) for i in items], section_label_map[cat], f"{cat}-summary")
            summary_obj = {"text": body, "citations": cites}

        checked_cnt = sum(
            1
            for s in sources_by_id.values()
            if s.category == cat and s.status == "approved"
        )
        sections_out.append(
            {
                "key": cat,
                "summary": summary_obj,
                "items": items,
                "sourcesChecked": checked_cnt,
            }
        )

    # 6. Opportunities
    opp_out: list[dict[str, Any]] = []
    for idx, opp in enumerate(content.get("opportunities", []), start=1):
        if not isinstance(opp, dict):
            continue
        rids = [int(x) for x in opp.get("record_ids", []) if isinstance(x, int) and x in records_by_id]
        oid = f"opp-{idx}"
        cites = cite_records(rids, "Opportunities", oid)
        prio = str(opp.get("priority") or "medium").lower()
        if prio not in ("low", "medium", "high"):
            prio = "medium"
        opp_out.append(
            {
                "id": oid,
                "headline": (opp.get("opportunity") or "").strip(),
                "explanation": {
                    "text": (opp.get("relevance") or opp.get("evidence") or "").strip(),
                    "citations": cites,
                },
                "impactLevel": prio,
                "likelihood": prio,
                "actNowBy": None,
                "linkedActionId": None,
                "signalId": str(rids[0]) if rids else "",
            }
        )

    # 7. Risks & Threats
    risk_out: list[dict[str, Any]] = []
    for idx, rsk in enumerate(content.get("risks", []), start=1):
        if not isinstance(rsk, dict):
            continue
        rids = [int(x) for x in rsk.get("record_ids", []) if isinstance(x, int) and x in records_by_id]
        rid_str = f"risk-{idx}"
        cites = cite_records(rids, "Risks & threats", rid_str)
        top_score = max((records_by_id[x].total for x in rids), default=50.0)
        imp = "high" if top_score >= 70 else ("medium" if top_score >= 45 else "low")
        risk_out.append(
            {
                "id": rid_str,
                "headline": (rsk.get("risk") or "").strip(),
                "explanation": {
                    "text": (rsk.get("mitigation") or "").strip(),
                    "citations": cites,
                },
                "impactLevel": imp,
                "likelihood": imp,
                "actNowBy": None,
                "linkedActionId": None,
                "signalId": str(rids[0]) if rids else "",
            }
        )

    # 8. Recommended Actions
    actions_out: list[dict[str, Any]] = []
    for idx, act in enumerate(content.get("actions", [])):
        if not isinstance(act, dict):
            continue
        rids = [int(x) for x in act.get("record_ids", []) if isinstance(x, int) and x in records_by_id]
        aid = str(act.get("id") or f"act-{idx}")
        cites = cite_records(rids, "Recommended actions", aid)
        why = (act.get("why") or "").strip()
        actions_out.append(
            {
                "id": aid,
                "text": (act.get("action") or act.get("text") or "").strip(),
                "rationale": {"text": why, "citations": cites} if why else None,
                "owner": (act.get("owner") or "Founder").strip(),
                "dueDate": act.get("dueDate"),
                "effort": act.get("effort") or "medium",
                "done": bool(act.get("done", False)),
                "linkedSignalId": str(rids[0]) if rids else None,
                "citations": cites,
                "isCustom": bool(act.get("isCustom", False)),
                "order": int(act.get("order", idx)),
            }
        )
    actions_out.sort(key=lambda a: a["order"])

    # 9. What We Should Watch
    meta = (company.profile or {}).get("_meta") or {}
    watchlist_set = {str(x) for x in meta.get("watchlist", [])}
    watch_out: list[dict[str, Any]] = []
    risk_watch_sec = raw_sections.get("risks_watchlist") or {}
    rw_body = (risk_watch_sec.get("body") or "").strip()
    rw_rids = [int(x) for x in risk_watch_sec.get("record_ids", []) if isinstance(x, int) and x in records_by_id]
    if rw_body and "No meaningful verified development" not in rw_body and rw_rids:
        for idx, rid in enumerate(rw_rids[:4]):
            rec = records_by_id[rid]
            wid = str(rec.id)
            cites = cite_records([rid], "Watch", f"watch-{wid}")
            a = rec.analysis or {}
            watch_out.append(
                {
                    "id": wid,
                    "title": (a.get("title") or rec.title or _domain_of(rec.url)).strip(),
                    "why": {"text": (a.get("summary") or rw_body).strip(), "citations": cites},
                    "expectedAt": rec.published.isoformat() if rec.published else None,
                    "sourceDomain": _domain_of(rec.url),
                    "inWatchlist": wid in watchlist_set,
                }
            )

    # 10. Source Appendix
    sources_out: list[dict[str, Any]] = []
    ordered_citations = sorted(citation_map.items(), key=lambda kv: kv[1])
    for rid, num in ordered_citations:
        rec = records_by_id[rid]
        src = sources_by_id.get(rec.source_id) if rec.source_id else None
        a = rec.analysis or {}
        sources_out.append(
            {
                "n": num,
                "title": (a.get("title") or rec.title or rec.url).strip(),
                "url": rec.url,
                "domain": _domain_of(rec.url),
                "type": _source_type_label(src, rec.url),
                "publishedAt": rec.published.isoformat() if rec.published else None,
                "fetchedAt": (_aware(rec.discovered) or created_dt).isoformat(),
                "verified": bool(rec.url),
                "usedIn": citation_used_in.get(rid, []),
            }
        )

    # Stats & week-over-week comparison
    all_cited_ids = {rid for rid in citation_map}
    verified_cnt = sum(1 for rid in all_cited_ids if records_by_id[rid].url)
    verified_pct = round((verified_cnt / len(all_cited_ids)) * 100) if all_cited_ids else 100
    counts = content.get("counts") or {}
    stats = {
        "signals": int(counts.get("records") or len(exec_items)),
        "sources": int(counts.get("sources") or len(sources_out)),
        "newEvidence": len(sources_out),
        "verifiedPct": verified_pct,
    }

    comparison = None
    if prev_report is not None:
        prev_content = prev_report.content or {}
        prev_opps = len(prev_content.get("opportunities", []))
        prev_risks = len(prev_content.get("risks", []))
        prev_ev = int((prev_content.get("counts") or {}).get("records", 0))
        comparison = {
            "opportunities": len(opp_out) - prev_opps,
            "threats": len(risk_out) - prev_risks,
            "newEvidence": stats["signals"] - prev_ev,
        }

    exec_sec = raw_sections.get("executive_summary") or {}
    headline_raw = (content.get("headline") or "").strip()
    if not headline_raw and exec_items:
        headline_raw = exec_items[0]["headline"]

    auto_run_id = content.get("automation_run_id")
    trigger_val = "scheduled" if content.get("trigger") == "scheduled" or auto_run_id else "manual"
    status_val = content.get("status")
    if status_val not in ("draft", "ready", "sent"):
        status_val = "ready" if trigger_val == "scheduled" else "draft"

    return {
        "id": str(report.id),
        "companyId": company.id,
        "companyName": company.name,
        "weekStart": week_start_dt.isoformat(),
        "weekEnd": week_end_dt.isoformat(),
        "generatedAt": (content.get("generated_at") or created_dt.isoformat()),
        "version": version_num,
        "status": status_val,
        "trigger": trigger_val,
        "automationRunId": str(auto_run_id) if auto_run_id else None,
        "unread": bool(content.get("unread", False)),
        "headline": headline_raw or None,
        "stats": stats,
        "comparison": comparison,
        "executiveSummary": exec_items,
        "sections": sections_out,
        "opportunities": opp_out,
        "risks": risk_out,
        "actions": actions_out,
        "watch": watch_out,
        "sources": sources_out,
        "notes": content.get("notes", []),
        "provenance": {
            "steps": [
                f"Crawled {stats['sources']} approved sources",
                f"Analysed {stats['signals']} evidence records",
                f"Ranked top {len(exec_items)} executive priorities",
            ],
            "model": content.get("model"),
        },
        "removedUnsupportedClaims": int(content.get("dropped_actions") or 0),
        "feedback": content.get("feedback"),
        "capabilities": {"emailConfigured": email_configured()},
        "isArchived": bool(all_reports and all_reports[-1].id != report.id),
    }


def serialize_brief_summary(report: Report, version_num: int) -> dict[str, Any]:
    content = report.content or {}
    created_dt = _aware(report.created) or _utcnow()
    week_start = (created_dt - timedelta(days=created_dt.weekday())).date()
    week_end = week_start + timedelta(days=6)
    actions = content.get("actions", [])
    done_cnt = sum(1 for a in actions if isinstance(a, dict) and a.get("done"))
    done_pct = round((done_cnt / len(actions)) * 100) if actions else 0
    trigger_val = "scheduled" if content.get("trigger") == "scheduled" or content.get("automation_run_id") else "manual"
    status_val = content.get("status")
    if status_val not in ("draft", "ready", "sent"):
        status_val = "ready" if trigger_val == "scheduled" else "draft"
    return {
        "id": str(report.id),
        "weekStart": week_start.isoformat(),
        "weekEnd": week_end.isoformat(),
        "status": status_val,
        "signals": int((content.get("counts") or {}).get("records", 0)),
        "actionsDonePct": done_pct,
        "trigger": trigger_val,
        "version": version_num,
    }


def _gen_steps(active_idx: int, *, done: bool = False, failed: bool = False) -> list[dict[str, str]]:
    labels = [
        "Collecting this week's signals",
        "Ranking priorities",
        "Writing sections",
        "Checking citations",
        "Finalising",
    ]
    out: list[dict[str, str]] = []
    for idx, label in enumerate(labels):
        if done:
            st = "done"
        elif failed and idx == active_idx:
            st = "failed"
        elif idx < active_idx:
            st = "done"
        elif idx == active_idx:
            st = "running"
        else:
            st = "pending"
        out.append({"label": label, "status": st})
    return out


def _generation_worker(job_log_id: int, company_id: int) -> None:
    import brief

    session = db_module.SessionLocal()
    try:
        company = session.get(Company, company_id)
        job_row = session.get(JobLog, job_log_id)
        if company is None or job_row is None:
            return

        job_row.detail = json.dumps({"steps": _gen_steps(2)})
        session.commit()

        report = brief.generate(session, company)
        content = dict(report.content or {})
        content["unread"] = True
        content["status"] = "draft"
        content["trigger"] = "manual"
        report.content = content
        session.commit()

        job_row = session.get(JobLog, job_log_id)
        if job_row:
            job_row.status = "ok"
            job_row.detail = json.dumps(
                {
                    "steps": _gen_steps(4, done=True),
                    "briefId": str(report.id),
                }
            )
            session.commit()
    except Exception as exc:
        logger.error("Brief generation failed for company %s: %s", company_id, exc, exc_info=True)
        session.rollback()
        job_row = session.get(JobLog, job_log_id)
        if job_row:
            job_row.status = "error"
            job_row.detail = json.dumps(
                {
                    "steps": _gen_steps(2, failed=True),
                    "error": str(exc) or exc.__class__.__name__,
                }
            )
            session.commit()
    finally:
        session.close()


def start_brief_generation(db: Session, company: Company) -> dict[str, Any]:
    prereq = get_prerequisites(db, company.id)
    if not prereq["ready"]:
        raise ValueError(prereq["reason"] or "Cannot generate brief yet.")

    existing = db.scalar(
        select(JobLog)
        .where(
            JobLog.company_id == company.id,
            JobLog.job == "brief_gen",
            JobLog.status == "running",
        )
        .order_by(JobLog.id.desc())
    )
    if existing is not None:
        return get_brief_generation(db, company.id)

    row = JobLog(
        company_id=company.id,
        job="brief_gen",
        status="running",
        detail=json.dumps({"steps": _gen_steps(0)}),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    t = threading.Thread(
        target=_generation_worker,
        args=(row.id, company.id),
        name=f"brief-gen-{row.id}",
        daemon=True,
    )
    t.start()
    return get_brief_generation(db, company.id)


def get_brief_generation(db: Session, company_id: int) -> dict[str, Any]:
    latest = db.scalar(
        select(JobLog)
        .where(JobLog.company_id == company_id, JobLog.job == "brief_gen")
        .order_by(JobLog.id.desc())
    )
    if latest is None:
        return {"status": "idle", "steps": []}
    try:
        detail = json.loads(latest.detail) if latest.detail else {}
    except json.JSONDecodeError:
        detail = {}
    if latest.status == "running":
        return {"status": "running", "steps": detail.get("steps", _gen_steps(1))}
    if latest.status == "error":
        return {
            "status": "failed",
            "steps": detail.get("steps", _gen_steps(2, failed=True)),
            "error": detail.get("error") or "Brief generation failed.",
        }
    return {
        "status": "idle",
        "steps": detail.get("steps", _gen_steps(4, done=True)),
        "briefId": detail.get("briefId"),
    }


def compare_briefs(db: Session, company: Company, report_a: Report, report_b: Report) -> dict[str, Any]:
    ser_a = serialize_brief(db, company, report_a)
    ser_b = serialize_brief(db, company, report_b)
    titles_a = [item["headline"] for item in ser_a["executiveSummary"]]
    titles_b = [item["headline"] for item in ser_b["executiveSummary"]]
    set_a = set(titles_a)
    set_b = set(titles_b)
    return {
        "briefA": {"id": ser_a["id"], "version": ser_a["version"], "weekStart": ser_a["weekStart"]},
        "briefB": {"id": ser_b["id"], "version": ser_b["version"], "weekStart": ser_b["weekStart"]},
        "added": [t for t in titles_b if t not in set_a],
        "removed": [t for t in titles_a if t not in set_b],
        "unchanged": [t for t in titles_b if t in set_a],
    }
