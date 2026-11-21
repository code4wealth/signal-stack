#!/usr/bin/env python3
"""Export real DB-backed sample reports and a metrics summary to Markdown.

Reads directly from the configured SQLAlchemy database (never invents counts):
  - <out_dir>/<company_slug>.md : latest brief + full evidence appendix
  - <out_dir>/SUMMARY.md        : approved sources per category, competitors,
                                  records collected, duplicates skipped on 2nd crawl,
                                  records analysed, briefs generated, and job logs

Usage:
    python scripts/export_reports.py
    python scripts/export_reports.py --out-dir docs/sample_reports
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import inspect as sa_inspect, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

import brief as brief_mod  # noqa: E402
import db as db_module  # noqa: E402
from db import AutomationRun, Company, JobLog, Record, Report, Source  # noqa: E402

CATEGORIES = ("customers", "competitors", "market", "internal")


def _slugify(name: str, company_id: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower()).strip("-")
    return slug or f"company-{company_id}"


def _parse_json(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def _second_crawl_duplicates(
    crawl_logs: list[JobLog],
    auto_crawls: list[AutomationRun],
) -> tuple[int | None, int]:
    """Return (duplicates_skipped_on_second_crawl, total_crawls_logged)."""
    entries: list[tuple[datetime, dict[str, Any]]] = []
    for log in crawl_logs:
        payload = _parse_json(log.detail)
        if payload:
            entries.append((log.at, payload))
    for run in auto_crawls:
        if isinstance(run.output, dict) and run.output:
            entries.append((run.finished_at or run.created, run.output))

    entries.sort(key=lambda item: item[0])
    total = len(entries)
    if total < 2:
        return None, total

    second = entries[1][1]
    for key in ("duplicates_skipped", "skipped_duplicates", "duplicates"):
        if key in second and second[key] is not None:
            return int(second[key]), total
    counts = second.get("counts") if isinstance(second.get("counts"), dict) else {}
    for key in ("duplicates_skipped", "skipped_duplicates", "duplicates"):
        if key in counts and counts[key] is not None:
            return int(counts[key]), total
    return 0, total


def _render_company_report(
    company: Company,
    latest_report: Report | None,
    records: list[Record],
    sources_by_id: dict[int, Source],
) -> str:
    lines: list[str] = [
        f"# Sample Intelligence Report — {company.name}",
        "",
        f"- **Company ID:** {company.id}",
        f"- **Website:** {company.website}",
        f"- **Context:** {company.context or '(none)'}",
        f"- **Exported at:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
    ]

    if latest_report is not None:
        lines.append(f"_Latest brief ID: {latest_report.id} · Created: {latest_report.created.isoformat()}_")
        lines.append("")
        md = (latest_report.markdown or "").strip()
        if not md and isinstance(latest_report.content, dict):
            md = brief_mod.render_markdown(latest_report.content).strip()
        lines.append(md or "_Brief content is empty._")
    else:
        lines.append("## Latest Brief")
        lines.append("")
        lines.append("_No brief has been generated for this company yet._")

    lines.append("")
    lines.append("## Evidence Appendix")
    lines.append("")
    if not records:
        lines.append("_No records collected for this company yet._")
    else:
        lines.append(
            "| Record ID | Category | Source | Score | Published / Discovered | Title & URL |"
        )
        lines.append("|---|---|---|---|---|---|")
        for rec in records:
            src = sources_by_id.get(rec.source_id) if rec.source_id else None
            cat = src.category if src else "internal"
            src_name = (src.name if src else "Internal").replace("|", "/")
            title = ((rec.analysis or {}).get("title") or rec.title or rec.url).replace("|", "/")
            ts = (rec.published or rec.discovered).strftime("%Y-%m-%d %H:%M UTC")
            lines.append(
                f"| {rec.id} | {cat} | {src_name} | {rec.total:.1f} | {ts} | [{title}]({rec.url}) |"
            )

        lines.append("")
        for rec in records:
            src = sources_by_id.get(rec.source_id) if rec.source_id else None
            analysis = rec.analysis or {}
            lines.append(f"### Record {rec.id} — {analysis.get('title') or rec.title or rec.url}")
            lines.append(f"- **URL:** {rec.url}")
            lines.append(f"- **Category:** {src.category if src else 'internal'}")
            lines.append(f"- **Content hash (SHA-256):** `{rec.content_hash}`")
            lines.append(f"- **Total score:** {rec.total:.1f}/100")
            if analysis:
                lines.append(f"- **Summary:** {analysis.get('summary', '')}")
                if analysis.get("evidence_verbatim") is not None:
                    lines.append(f"- **Verbatim evidence verified:** {bool(analysis.get('evidence_verbatim'))}")
            else:
                lines.append("- **Analysis:** Pending")
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def export_reports(
    db: Session,
    out_dir: Path,
    *,
    company_ids: list[int] | None = None,
) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)

    stmt = select(Company).order_by(Company.id.asc())
    if company_ids:
        stmt = stmt.where(Company.id.in_(company_ids))
    companies = list(db.scalars(stmt).all())

    used_slugs: set[str] = set()
    summaries: list[dict[str, Any]] = []
    written_files: list[Path] = []

    for company in companies:
        slug = _slugify(company.name, company.id)
        if slug in used_slugs:
            slug = f"{slug}-{company.id}"
        used_slugs.add(slug)

        sources = list(
            db.scalars(select(Source).where(Source.company_id == company.id).order_by(Source.id.asc())).all()
        )
        sources_by_id = {s.id: s for s in sources}
        approved_by_cat = {
            cat: sum(1 for s in sources if s.category == cat and s.status == "approved")
            for cat in CATEGORIES
        }

        profile = company.profile or {}
        competitors = [
            c.get("name") or c.get("url") or "Unnamed competitor"
            for c in (profile.get("competitors") or [])
            if isinstance(c, dict)
        ]

        records = list(
            db.scalars(
                select(Record)
                .where(Record.company_id == company.id)
                .order_by(Record.total.desc(), Record.id.asc())
            ).all()
        )
        analysed_count = sum(1 for r in records if r.analysis is not None)

        reports = list(
            db.scalars(
                select(Report).where(Report.company_id == company.id).order_by(Report.id.desc())
            ).all()
        )
        latest_report = reports[0] if reports else None

        job_logs = list(
            db.scalars(
                select(JobLog).where(JobLog.company_id == company.id).order_by(JobLog.id.asc())
            ).all()
        )
        crawl_logs = [j for j in job_logs if j.job in ("crawl", "crawl_run")]
        auto_crawls: list[AutomationRun] = []
        if sa_inspect(db.get_bind()).has_table(AutomationRun.__tablename__):
            auto_crawls = list(
                db.scalars(
                    select(AutomationRun)
                    .where(AutomationRun.company_id == company.id, AutomationRun.job_type == "crawl")
                    .order_by(AutomationRun.id.asc())
                ).all()
            )
        dup_2nd, total_crawls = _second_crawl_duplicates(crawl_logs, auto_crawls)

        report_path = out_dir / f"{slug}.md"
        report_path.write_text(
            _render_company_report(company, latest_report, records, sources_by_id),
            encoding="utf-8",
        )
        written_files.append(report_path)

        log_counts = Counter((j.job, j.status) for j in job_logs)
        summaries.append(
            {
                "company_id": company.id,
                "name": company.name,
                "website": company.website,
                "slug": slug,
                "approved_by_category": approved_by_cat,
                "approved_total": sum(approved_by_cat.values()),
                "competitors": competitors,
                "competitor_count": len(competitors),
                "records_collected": len(records),
                "total_crawls": total_crawls,
                "duplicates_skipped_second_crawl": dup_2nd,
                "records_analysed": analysed_count,
                "briefs_generated": len(reports),
                "latest_brief_id": latest_report.id if latest_report else None,
                "job_log_counts": {f"{job}:{status}": cnt for (job, status), cnt in sorted(log_counts.items())},
                "recent_job_logs": [
                    {
                        "id": j.id,
                        "job": j.job,
                        "status": j.status,
                        "at": j.at.isoformat(),
                        "detail": (j.detail or "")[:200],
                    }
                    for j in job_logs[-15:]
                ],
            }
        )

    summary_lines: list[str] = [
        "# Signal Stack — Database Export Summary",
        "",
        f"Generated from database at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}. "
        "Every count below is queried directly from stored database rows.",
        "",
    ]

    if not summaries:
        summary_lines.append("_No companies found in the database._")
    else:
        summary_lines.extend(
            [
                "## Overview",
                "",
                "| Company | Approved sources (C / Comp / M / I) | Competitors | Records collected | Duplicates skipped (2nd crawl) | Records analysed | Briefs | Job logs |",
                "|---|---|---|---|---|---|---|---|",
            ]
        )
        for item in summaries:
            cats = item["approved_by_category"]
            cat_str = f"{cats['customers']} / {cats['competitors']} / {cats['market']} / {cats['internal']} (total {item['approved_total']})"
            dup_str = (
                str(item["duplicates_skipped_second_crawl"])
                if item["duplicates_skipped_second_crawl"] is not None
                else f"N/A ({item['total_crawls']} crawl)"
            )
            log_total = sum(item["job_log_counts"].values())
            summary_lines.append(
                f"| [{item['name']}](./{item['slug']}.md) | {cat_str} | {item['competitor_count']} | "
                f"{item['records_collected']} | {dup_str} | {item['records_analysed']} | "
                f"{item['briefs_generated']} | {log_total} |"
            )

        summary_lines.append("")
        for item in summaries:
            summary_lines.append(f"## {item['name']} ({item['website']})")
            summary_lines.append("")
            summary_lines.append(f"- **Report file:** `{item['slug']}.md`")
            summary_lines.append(
                f"- **Approved sources per category:** customers={item['approved_by_category']['customers']}, "
                f"competitors={item['approved_by_category']['competitors']}, "
                f"market={item['approved_by_category']['market']}, "
                f"internal={item['approved_by_category']['internal']}"
            )
            comp_list = ", ".join(item["competitors"]) if item["competitors"] else "none recorded"
            summary_lines.append(f"- **Competitors ({item['competitor_count']}):** {comp_list}")
            summary_lines.append(f"- **Records collected:** {item['records_collected']}")
            if item["duplicates_skipped_second_crawl"] is not None:
                summary_lines.append(
                    f"- **Duplicates skipped on second crawl:** {item['duplicates_skipped_second_crawl']}"
                )
            else:
                summary_lines.append(
                    f"- **Duplicates skipped on second crawl:** N/A ({item['total_crawls']} crawl logged)"
                )
            summary_lines.append(f"- **Records analysed:** {item['records_analysed']}")
            summary_lines.append(
                f"- **Briefs generated:** {item['briefs_generated']}"
                + (f" (latest ID #{item['latest_brief_id']})" if item["latest_brief_id"] else "")
            )
            summary_lines.append("")
            summary_lines.append("### Job logs")
            summary_lines.append("")
            if not item["recent_job_logs"]:
                summary_lines.append("_No job logs recorded for this company._")
            else:
                summary_lines.append("| ID | Job | Status | Timestamp | Detail |")
                summary_lines.append("|---|---|---|---|---|")
                for log in item["recent_job_logs"]:
                    detail_clean = log["detail"].replace("|", "/")
                    summary_lines.append(
                        f"| {log['id']} | {log['job']} | {log['status']} | {log['at']} | `{detail_clean}` |"
                    )
            summary_lines.append("")

    summary_path = out_dir / "SUMMARY.md"
    summary_path.write_text("\n".join(summary_lines).rstrip() + "\n", encoding="utf-8")
    written_files.append(summary_path)

    return {
        "out_dir": str(out_dir),
        "companies_exported": len(summaries),
        "files": [str(p) for p in written_files],
        "summaries": summaries,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export real DB-backed reports and summary Markdown.")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=ROOT / "docs" / "sample_reports",
        help="Directory to write <company>.md and SUMMARY.md (default: docs/sample_reports)",
    )
    parser.add_argument(
        "--company-id",
        type=int,
        action="append",
        dest="company_ids",
        help="Optional company ID(s) to export (default: all companies in DB)",
    )
    args = parser.parse_args(argv)

    db_module.init_db()
    with db_module.SessionLocal() as db:
        result = export_reports(db, args.out_dir, company_ids=args.company_ids)

    print(
        f"Exported {result['companies_exported']} company report(s) + SUMMARY.md to {result['out_dir']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
