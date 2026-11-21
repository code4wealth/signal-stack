"""Database deduplication helpers for Signal Stack.

Removes duplicate Company (empty retries), Source, Record (identical content_hash),
and QA rows while preserving genuine [UPDATED] records that have distinct content hashes.
"""

from __future__ import annotations

from collections import defaultdict
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db import Company, QA, Record, Report, Source
from research import canonical_url_key


def deduplicate_company(db: Session, company: Company, *, dry_run: bool = False) -> dict[str, int]:
    """Deduplicate sources, records, and QA slots within a single company."""
    counts = {"sources_removed": 0, "records_removed": 0, "qa_removed": 0}

    # 1. Duplicate Sources by canonical_url_key
    sources = list(
        db.scalars(select(Source).where(Source.company_id == company.id).order_by(Source.id.asc())).all()
    )
    record_counts_by_src = dict(
        db.execute(
            select(Record.source_id, func.count(Record.id))
            .where(Record.company_id == company.id, Record.source_id.is_not(None))
            .group_by(Record.source_id)
        ).all()
    )
    src_groups: dict[str, list[Source]] = defaultdict(list)
    for src in sources:
        src_groups[canonical_url_key(src.url)].append(src)

    for group in src_groups.values():
        if len(group) <= 1:
            continue
        group_sorted = sorted(
            group,
            key=lambda s: (
                1 if s.status == "approved" else 0,
                int(record_counts_by_src.get(s.id, 0)),
                -s.id,
            ),
            reverse=True,
        )
        keeper = group_sorted[0]
        for dup in group_sorted[1:]:
            counts["sources_removed"] += 1
            if not dry_run:
                dup_records = list(
                    db.scalars(select(Record).where(Record.source_id == dup.id)).all()
                )
                for rec in dup_records:
                    rec.source_id = keeper.id
                db.delete(dup)

    if not dry_run and counts["sources_removed"]:
        db.flush()

    # 2. Duplicate Records by content_hash (preserves distinct [UPDATED] hashes)
    records = list(
        db.scalars(select(Record).where(Record.company_id == company.id).order_by(Record.id.asc())).all()
    )
    rec_groups: dict[str, list[Record]] = defaultdict(list)
    for rec in records:
        rec_groups[rec.content_hash].append(rec)

    for group in rec_groups.values():
        if len(group) <= 1:
            continue
        group_sorted = sorted(
            group,
            key=lambda r: (
                1 if r.analysis is not None else 0,
                float(r.total or 0.0),
                -r.id,
            ),
            reverse=True,
        )
        for dup in group_sorted[1:]:
            counts["records_removed"] += 1
            if not dry_run:
                db.delete(dup)

    # 3. Duplicate non-followup QA slots by idx
    qas = list(
        db.scalars(
            select(QA).where(QA.company_id == company.id, QA.is_followup.is_(False)).order_by(QA.id.asc())
        ).all()
    )
    qa_groups: dict[int, list[QA]] = defaultdict(list)
    for qa in qas:
        qa_groups[qa.idx].append(qa)

    for group in qa_groups.values():
        if len(group) <= 1:
            continue
        group_sorted = sorted(
            group,
            key=lambda q: (
                1 if (q.answer and q.answer.strip()) else 0,
                -q.id,
            ),
            reverse=True,
        )
        for dup in group_sorted[1:]:
            counts["qa_removed"] += 1
            if not dry_run:
                db.delete(dup)

    return counts


def deduplicate_database(
    db: Session,
    *,
    dry_run: bool = False,
    merge_companies: bool = False,
) -> dict[str, int]:
    """Deduplicate across all companies in the database."""
    totals = {
        "companies_removed": 0,
        "sources_removed": 0,
        "records_removed": 0,
        "qa_removed": 0,
    }

    companies = list(db.scalars(select(Company).order_by(Company.id.asc())).all())
    company_groups: dict[tuple[str, str], list[Company]] = defaultdict(list)
    for comp in companies:
        key = ((comp.name or "").strip().lower(), canonical_url_key(comp.website))
        company_groups[key].append(comp)

    removed_company_ids: set[int] = set()
    for group in company_groups.values():
        if len(group) <= 1:
            continue

        def _company_rank(c: Company) -> tuple[int, int, int, int, int]:
            rec_cnt = db.scalar(select(func.count(Record.id)).where(Record.company_id == c.id)) or 0
            rep_cnt = db.scalar(select(func.count(Report.id)).where(Report.company_id == c.id)) or 0
            src_cnt = db.scalar(select(func.count(Source.id)).where(Source.company_id == c.id)) or 0
            has_prof = 1 if (c.profile or {}).get("summary") else 0
            return (rep_cnt, rec_cnt, has_prof, src_cnt, -c.id)

        ranked = sorted(group, key=_company_rank, reverse=True)
        keeper = ranked[0]
        for dup in ranked[1:]:
            rec_cnt = db.scalar(select(func.count(Record.id)).where(Record.company_id == dup.id)) or 0
            rep_cnt = db.scalar(select(func.count(Report.id)).where(Report.company_id == dup.id)) or 0
            if rec_cnt == 0 and rep_cnt == 0:
                totals["companies_removed"] += 1
                removed_company_ids.add(dup.id)
                if not dry_run:
                    db.delete(dup)
            elif merge_companies:
                totals["companies_removed"] += 1
                removed_company_ids.add(dup.id)
                if not dry_run:
                    for src in db.scalars(select(Source).where(Source.company_id == dup.id)).all():
                        src.company_id = keeper.id
                    for rec in db.scalars(select(Record).where(Record.company_id == dup.id)).all():
                        rec.company_id = keeper.id
                    for rep in db.scalars(select(Report).where(Report.company_id == dup.id)).all():
                        rep.company_id = keeper.id
                    db.flush()
                    db.delete(dup)

    if not dry_run and totals["companies_removed"]:
        db.flush()

    for comp in companies:
        if comp.id in removed_company_ids:
            continue
        res = deduplicate_company(db, comp, dry_run=dry_run)
        for k, v in res.items():
            totals[k] += v

    if not dry_run:
        db.commit()
    else:
        db.rollback()
    return totals
