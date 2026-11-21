"""Tests for scripts/export_reports.py verifying real DB metrics without invented counts."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from db import AutomationBase, Base, Company, JobLog, Record, Report, Source  # noqa: E402
from scripts.export_reports import export_reports  # noqa: E402


def test_export_reports_writes_company_markdown_and_exact_summary(tmp_path: Path) -> None:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    AutomationBase.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    with Session() as db:
        co = Company(
            name="Acme Analytics",
            website="https://acme.example",
            context="B2B product analytics",
            profile={
                "summary": "Acme builds analytics.",
                "competitors": [
                    {"name": "RivalOne", "url": "https://rival1.example"},
                    {"name": "RivalTwo", "url": "https://rival2.example"},
                ],
            },
        )
        db.add(co)
        db.flush()

        s_cust = Source(
            company_id=co.id,
            name="Acme Forum",
            url="https://forum.acme.example",
            category="customers",
            status="approved",
        )
        s_comp = Source(
            company_id=co.id,
            name="RivalOne Blog",
            url="https://rival1.example/blog",
            category="competitors",
            status="approved",
        )
        s_rejected = Source(
            company_id=co.id,
            name="Rejected Feed",
            url="https://bad.example",
            category="market",
            status="rejected",
        )
        db.add_all([s_cust, s_comp, s_rejected])
        db.flush()

        r1 = Record(
            company_id=co.id,
            source_id=s_cust.id,
            url="https://forum.acme.example/post-1",
            title="SSO ask",
            text="Customers ask for SSO.",
            content_hash="1" * 64,
            total=82.5,
            analysis={"title": "Customers ask for SAML SSO", "summary": "Renewal blocker.", "evidence_verbatim": True},
        )
        r2 = Record(
            company_id=co.id,
            source_id=s_comp.id,
            url="https://rival1.example/blog/pricing",
            title="Rival pricing",
            text="Rival dropped price.",
            content_hash="2" * 64,
            total=64.0,
            analysis=None,
        )
        db.add_all([r1, r2])
        db.flush()

        report = Report(
            company_id=co.id,
            content={"company": {"id": co.id, "name": co.name, "website": co.website}},
            markdown="# Monday Morning Brief — Acme Analytics\n\n## Executive Summary\nCustomers requested SAML SSO.\n",
        )
        db.add(report)

        t0 = datetime(2026, 11, 18, 9, 0, tzinfo=timezone.utc)
        db.add_all(
            [
                JobLog(
                    company_id=co.id,
                    job="crawl",
                    status="ok",
                    at=t0,
                    detail=json.dumps({"new_records": 2, "duplicates_skipped": 0}),
                ),
                JobLog(
                    company_id=co.id,
                    job="crawl",
                    status="ok",
                    at=t0 + timedelta(hours=1),
                    detail=json.dumps({"new_records": 0, "duplicates_skipped": 2}),
                ),
                JobLog(
                    company_id=co.id,
                    job="brief",
                    status="ok",
                    at=t0 + timedelta(hours=2),
                    detail=json.dumps({"report_id": 1}),
                ),
            ]
        )
        db.commit()

        result = export_reports(db, tmp_path)

    assert result["companies_exported"] == 1
    co_md = (tmp_path / "acme-analytics.md").read_text(encoding="utf-8")
    summary_md = (tmp_path / "SUMMARY.md").read_text(encoding="utf-8")

    assert "Monday Morning Brief — Acme Analytics" in co_md
    assert "## Evidence Appendix" in co_md
    assert "https://forum.acme.example/post-1" in co_md
    assert "https://rival1.example/blog/pricing" in co_md

    # Verify exact DB numbers in SUMMARY.md (rejected market source is NOT counted as approved)
    assert "customers=1, competitors=1, market=0, internal=0" in summary_md
    assert "Competitors (2):** RivalOne, RivalTwo" in summary_md
    assert "Records collected:** 2" in summary_md
    assert "Duplicates skipped on second crawl:** 2" in summary_md
    assert "Records analysed:** 1" in summary_md
    assert "Briefs generated:** 1" in summary_md
    assert "Job logs" in summary_md
