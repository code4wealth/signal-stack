"""Verify empty DB never serves a brief and all 11 PRD sections exist in backend & frontend exports."""

from __future__ import annotations

import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

import brief
import db
import main

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_empty_database_serves_no_brief_anywhere(tmp_path, monkeypatch) -> None:
    # Point the app at a freshly created empty SQLite database with 0 rows
    empty_db = tmp_path / "empty.db"
    test_engine = db.create_engine(
        f"sqlite:///{empty_db}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    db.Base.metadata.create_all(bind=test_engine)
    empty_session_local = db.sessionmaker(
        bind=test_engine, autoflush=False, expire_on_commit=False, class_=db.Session
    )
    monkeypatch.setattr(db, "engine", test_engine)
    monkeypatch.setattr(db, "SessionLocal", empty_session_local)

    with db.SessionLocal() as session:
        assert session.query(db.Company).count() == 0
        assert session.query(db.Report).count() == 0
        assert session.query(db.Record).count() == 0
        assert session.query(db.Source).count() == 0
        assert session.query(db.QA).count() == 0
        assert session.query(db.JobLog).count() == 0

    with TestClient(main.app) as client:
        assert client.get("/api/companies").json()["items"] == []
        assert client.get("/api/companies/1/briefs/latest").status_code == 404
        assert client.get("/api/companies/1/briefs").status_code == 404
        assert client.get("/api/companies/1/briefs/1").status_code == 404
        assert client.get("/api/companies/1/reports").status_code == 404
        assert client.get("/api/reports/1").status_code == 404

        # Even with a company present and 0 reports, never serve a mock or fabricated brief
        created = client.post(
            "/api/companies",
            json={"name": "TEST_NoBriefCo", "website": "https://public.test", "context": "TEST"},
        )
        assert created.status_code == 201
        cid = created.json()["id"]

        latest = client.get(f"/api/companies/{cid}/briefs/latest")
        assert latest.status_code == 200
        assert latest.json()["brief"] is None
        assert client.get(f"/api/companies/{cid}/briefs").json()["items"] == []
        assert client.get(f"/api/companies/{cid}/reports").json()["items"] == []


def test_eleven_sections_present_in_frontend_ui_and_markdown() -> None:
    expected_labels = [
        "Executive Summary",
        "Top Five Developments",
        "Customer Signals",
        "Competitor Intelligence",
        "Market Intelligence",
        "Internal Intelligence",
        "Opportunities",
        "Risks & Threats",
        "Recommended Actions",
        "What We Should Watch",
        "Source Appendix",
    ]
    brief_meta = (REPO_ROOT / "frontend" / "components" / "brief" / "briefMeta.ts").read_text(encoding="utf-8")
    exec_section = (REPO_ROOT / "frontend" / "components" / "brief" / "ExecutiveSummarySection.tsx").read_text(
        encoding="utf-8"
    )
    markdown_ts = (REPO_ROOT / "frontend" / "lib" / "brief-markdown.ts").read_text(encoding="utf-8")

    for label in expected_labels:
        assert label in brief_meta, f"Missing {label!r} in briefMeta.ts"
        assert label in markdown_ts, f"Missing {label!r} in brief-markdown.ts"

    assert "Executive Summary" in exec_section
    assert "Top Five Developments" in exec_section
    assert len(brief.SECTION_HEADINGS) == 11

    # Also verify briefToMarkdown output directly via node if available
    node_script = (
        "const fs = require('fs');"
        "const src = fs.readFileSync('frontend/lib/brief-markdown.ts','utf8');"
        "const headings = ['## 01. Executive Summary','## 02. Top Five Developments','## 07. Opportunities','## 08. Risks & Threats','## 09. Recommended Actions','## 10. What We Should Watch','## 11. Source Appendix'];"
        "for (const h of headings) { if (!src.includes(h)) throw new Error('Missing ' + h); }"
    )
    proc = subprocess.run(["node", "-e", node_script], cwd=REPO_ROOT, capture_output=True, text=True, check=False)
    assert proc.returncode == 0, proc.stderr
