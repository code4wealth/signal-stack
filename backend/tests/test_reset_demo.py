"""Tests for scripts/reset_demo.py: confirmation gate, single-company guard, cascade, and API/DB fallback."""

from __future__ import annotations

import io
import sys
from pathlib import Path

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

SCRIPTS_DIR = Path(__file__).resolve().parent.parent.parent / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import db as app_db  # noqa: E402
import reset_demo  # noqa: E402


@pytest.fixture()
def mem_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )

    @app_db.event.listens_for(engine, "connect")
    def _fk(dbapi_conn, _rec):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    app_db.Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)
    with TestingSession() as session:
        yield session


def _seed_company(session: Session, name: str, website: str = "https://example.test") -> app_db.Company:
    company = app_db.Company(name=name, website=website, context="TEST context")
    session.add(company)
    session.flush()

    session.add(app_db.QA(company_id=company.id, idx=0, question="TEST Q?"))
    source = app_db.Source(
        company_id=company.id, name="TEST source", url=f"{website}/news", category="market"
    )
    session.add(source)
    session.flush()

    session.add(
        app_db.Record(
            company_id=company.id,
            source_id=source.id,
            url=f"{website}/post",
            title="TEST record",
            text="TEST text",
            content_hash="abc123",
        )
    )
    session.add(
        app_db.Report(
            company_id=company.id,
            content={"top_signals": [], "actions": []},
            markdown="# TEST",
        )
    )
    session.add(app_db.JobLog(company_id=company.id, job="analyse", status="ok", detail="TEST"))
    session.commit()
    return company


def test_dry_run_without_yes_does_not_delete(mem_session: Session) -> None:
    target = _seed_company(mem_session, "TEST_Discont", "https://discont.test")
    other = _seed_company(mem_session, "TEST_Keep", "https://keep.test")
    buf = io.StringIO()

    result = reset_demo.reset_company(mem_session, name="TEST_Discont", yes=False, stream=buf)

    assert result["deleted"] is False
    assert result["before"] == {
        "companies": 2,
        "qa": 2,
        "sources": 2,
        "records": 2,
        "reports": 2,
        "job_logs": 2,
    }
    assert result["after"] == result["before"]
    assert "WOULD delete" in buf.getvalue()
    assert "--yes" in buf.getvalue()
    assert mem_session.get(app_db.Company, target.id) is not None
    assert mem_session.get(app_db.Company, other.id) is not None


def test_yes_deletes_only_target_company_and_cascades(mem_session: Session) -> None:
    target = _seed_company(mem_session, "TEST_Discont", "https://discont.test")
    other = _seed_company(mem_session, "TEST_Keep", "https://keep.test")
    # Global job log (company_id=None) must be preserved
    mem_session.add(app_db.JobLog(company_id=None, job="weekly", status="ok", detail="global"))
    mem_session.commit()

    buf = io.StringIO()
    result = reset_demo.reset_company(mem_session, company_id=target.id, yes=True, stream=buf)

    assert result["deleted"] is True
    assert result["via"] == "db"
    assert result["before"] == {
        "companies": 2,
        "qa": 2,
        "sources": 2,
        "records": 2,
        "reports": 2,
        "job_logs": 3,
    }
    assert result["after"] == {
        "companies": 1,
        "qa": 1,
        "sources": 1,
        "records": 1,
        "reports": 1,
        "job_logs": 2,
    }
    assert mem_session.get(app_db.Company, target.id) is None
    assert mem_session.get(app_db.Company, other.id) is not None


def test_single_company_guard_refuses_ambiguous_name(mem_session: Session) -> None:
    _seed_company(mem_session, "TEST_Dup", "https://one.test")
    _seed_company(mem_session, "TEST_Dup", "https://two.test")

    with pytest.raises(reset_demo.ResetError, match="matched 2 companies"):
        reset_demo.reset_company(mem_session, name="TEST_Dup", yes=True)

    assert reset_demo.get_table_counts(mem_session)["companies"] == 2


def test_single_company_guard_refuses_both_or_neither_selector(mem_session: Session) -> None:
    _seed_company(mem_session, "TEST_Only")

    with pytest.raises(reset_demo.ResetError):
        reset_demo.reset_company(mem_session, yes=True)

    with pytest.raises(reset_demo.ResetError):
        reset_demo.reset_company(mem_session, company_id=1, name="TEST_Only", yes=True)


def test_cli_refuses_multiple_ids_or_names(monkeypatch, mem_session: Session) -> None:
    _seed_company(mem_session, "TEST_One")
    _seed_company(mem_session, "TEST_Two")
    monkeypatch.setattr(reset_demo, "_open_session", lambda _url=None: mem_session)

    with pytest.raises(SystemExit) as exc_info:
        reset_demo.main(["--id", "1", "--id", "2", "--yes"])
    assert exc_info.value.code != 0
    assert reset_demo.get_table_counts(mem_session)["companies"] == 2


def test_api_fallback_on_405_uses_direct_db(mem_session: Session) -> None:
    target = _seed_company(mem_session, "TEST_ApiFallback")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "DELETE"
        assert request.url.path == f"/api/companies/{target.id}"
        return httpx.Response(405, json={"detail": "Method Not Allowed"})

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="http://api.test")
    buf = io.StringIO()
    result = reset_demo.reset_company(
        mem_session,
        company_id=target.id,
        yes=True,
        base_url="http://api.test",
        http_client=client,
        stream=buf,
    )

    assert result["deleted"] is True
    assert result["via"] == "db"
    assert result["after"]["companies"] == 0


def test_api_delete_used_when_endpoint_returns_204(mem_session: Session) -> None:
    target = _seed_company(mem_session, "TEST_ApiSuccess")
    called = []

    def handler(request: httpx.Request) -> httpx.Response:
        called.append((request.method, request.url.path))
        # Simulate API deleting the company from DB
        row = mem_session.get(app_db.Company, target.id)
        if row is not None:
            mem_session.delete(row)
            mem_session.commit()
        return httpx.Response(204)

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="http://api.test")
    result = reset_demo.reset_company(
        mem_session,
        company_id=target.id,
        yes=True,
        base_url="http://api.test",
        http_client=client,
    )

    assert called == [("DELETE", f"/api/companies/{target.id}")]
    assert result["deleted"] is True
    assert result["via"] == "api"
    assert result["after"]["companies"] == 0
