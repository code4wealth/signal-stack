#!/usr/bin/env python3
"""Safely delete ONE company (with cascade) for demo hygiene.

Refuses to run against more than one company. Requires --yes to mutate the
database; without --yes, prints what WOULD be deleted and exits cleanly.

Checks DELETE /api/companies/{id} when --base-url is reachable and supports it,
otherwise deletes directly from the database using the exact ON DELETE CASCADE
rules defined in backend/db.py.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Sequence, TextIO

import httpx
from sqlalchemy import create_engine, delete, event, func, select
from sqlalchemy.orm import Session, sessionmaker

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import db as app_db  # noqa: E402

TABLE_ORDER = ("companies", "qa", "sources", "records", "reports", "job_logs")


class ResetError(RuntimeError):
    """Raised when company selection or deletion violates safety rules."""


def get_table_counts(db: Session) -> dict[str, int]:
    """Return exact row counts for all six Signal Stack tables."""
    return {
        "companies": db.scalar(select(func.count()).select_from(app_db.Company)) or 0,
        "qa": db.scalar(select(func.count()).select_from(app_db.QA)) or 0,
        "sources": db.scalar(select(func.count()).select_from(app_db.Source)) or 0,
        "records": db.scalar(select(func.count()).select_from(app_db.Record)) or 0,
        "reports": db.scalar(select(func.count()).select_from(app_db.Report)) or 0,
        "job_logs": db.scalar(select(func.count()).select_from(app_db.JobLog)) or 0,
    }


def company_child_counts(db: Session, company_id: int) -> dict[str, int]:
    """Return exact row counts tied to *company_id* across all six tables."""
    return {
        "companies": db.scalar(
            select(func.count()).select_from(app_db.Company).where(app_db.Company.id == company_id)
        )
        or 0,
        "qa": db.scalar(
            select(func.count()).select_from(app_db.QA).where(app_db.QA.company_id == company_id)
        )
        or 0,
        "sources": db.scalar(
            select(func.count()).select_from(app_db.Source).where(app_db.Source.company_id == company_id)
        )
        or 0,
        "records": db.scalar(
            select(func.count()).select_from(app_db.Record).where(app_db.Record.company_id == company_id)
        )
        or 0,
        "reports": db.scalar(
            select(func.count()).select_from(app_db.Report).where(app_db.Report.company_id == company_id)
        )
        or 0,
        "job_logs": db.scalar(
            select(func.count()).select_from(app_db.JobLog).where(app_db.JobLog.company_id == company_id)
        )
        or 0,
    }


def resolve_single_company(
    db: Session, *, company_id: int | None = None, name: str | None = None
) -> app_db.Company:
    """Resolve exactly ONE company by id or name; refuse 0 or >1 matches."""
    if (company_id is None) == (name is None):
        raise ResetError("Single-company guard: specify exactly one of --id or --name.")

    if company_id is not None:
        if isinstance(company_id, bool) or company_id <= 0:
            raise ResetError(f"Invalid company id: {company_id!r}")
        matches = list(db.scalars(select(app_db.Company).where(app_db.Company.id == company_id)).all())
        selector = f"id={company_id}"
    else:
        assert name is not None
        cleaned = name.strip()
        if not cleaned:
            raise ResetError("Company name must not be blank.")
        matches = list(db.scalars(select(app_db.Company).where(app_db.Company.name == cleaned)).all())
        if not matches:
            matches = list(
                db.scalars(
                    select(app_db.Company).where(func.lower(app_db.Company.name) == cleaned.lower())
                ).all()
            )
        selector = f"name={cleaned!r}"

    if len(matches) == 0:
        raise ResetError(f"No company found matching {selector}.")
    if len(matches) > 1:
        raise ResetError(
            f"Refusing to run: {selector} matched {len(matches)} companies "
            "(single-company guard requires exactly 1)."
        )
    return matches[0]


def try_api_delete(
    base_url: str,
    company_id: int,
    *,
    http_client: httpx.Client | None = None,
    stream: TextIO = sys.stdout,
) -> bool:
    """Attempt DELETE /api/companies/{id}. Return True if deleted via API, False to fall back."""
    owns_client = http_client is None
    client = http_client or httpx.Client(base_url=base_url.rstrip("/"), timeout=3.0)
    try:
        response = client.delete(f"/api/companies/{company_id}")
    except httpx.HTTPError as exc:
        print(f"API unreachable ({exc.__class__.__name__}); using direct DB cascade.", file=stream)
        return False
    finally:
        if owns_client:
            client.close()

    if 200 <= response.status_code < 300:
        return True
    if response.status_code in (404, 405):
        print(
            f"API returned {response.status_code} for DELETE /api/companies/{company_id}; "
            "using direct DB cascade.",
            file=stream,
        )
        return False
    raise ResetError(
        f"API DELETE /api/companies/{company_id} failed with {response.status_code}: "
        f"{response.text[:300]}"
    )


def delete_company_direct(db: Session, company: app_db.Company) -> None:
    """Delete one company and its ON DELETE CASCADE children in a single transaction."""
    company_id = company.id
    # Delete child tables matching backend/db.py ON DELETE CASCADE foreign keys
    # (qa, sources, records, reports, job_logs where company_id == company_id).
    for model in (app_db.JobLog, app_db.Report, app_db.Record, app_db.Source, app_db.QA):
        db.execute(delete(model).where(model.company_id == company_id))
    result = db.execute(delete(app_db.Company).where(app_db.Company.id == company_id))
    if result.rowcount != 1:
        db.rollback()
        raise ResetError(
            f"Single-company guard aborted transaction: expected 1 company deleted, got {result.rowcount}."
        )
    db.commit()


def _format_counts(counts: dict[str, int]) -> str:
    return ", ".join(f"{table}={counts[table]}" for table in TABLE_ORDER)


def reset_company(
    db: Session,
    *,
    company_id: int | None = None,
    name: str | None = None,
    yes: bool = False,
    base_url: str | None = None,
    http_client: httpx.Client | None = None,
    stream: TextIO = sys.stdout,
) -> dict:
    """Preview or delete one company and return before/after table counts."""
    company = resolve_single_company(db, company_id=company_id, name=name)
    before = get_table_counts(db)
    would_delete = company_child_counts(db, company.id)

    print(
        f"Target company: id={company.id}, name={company.name!r}, website={company.website!r}",
        file=stream,
    )
    print(f"Before counts: {_format_counts(before)}", file=stream)
    print(f"WOULD delete rows for company #{company.id}: {_format_counts(would_delete)}", file=stream)

    if not yes:
        print("Dry run only (pass --yes to execute deletion). No rows were modified.", file=stream)
        return {
            "deleted": False,
            "via": None,
            "company_id": company.id,
            "company_name": company.name,
            "would_delete": would_delete,
            "before": before,
            "after": before,
        }

    used_api = False
    if base_url:
        used_api = try_api_delete(base_url, company.id, http_client=http_client, stream=stream)
    if not used_api:
        delete_company_direct(db, company)

    db.expire_all()
    after = get_table_counts(db)
    print(f"Deleted company #{company.id} ({company.name!r}) via {'API' if used_api else 'direct DB'}.", file=stream)
    print(f"After counts:  {_format_counts(after)}", file=stream)
    return {
        "deleted": True,
        "via": "api" if used_api else "db",
        "company_id": company.id,
        "company_name": company.name,
        "would_delete": would_delete,
        "before": before,
        "after": after,
    }


def _open_session(database_url: str | None = None) -> Session:
    if not database_url:
        return app_db.SessionLocal()

    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    engine = create_engine(database_url, connect_args=connect_args, future=True)
    if database_url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _fk(dbapi_conn, _rec):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)
    return factory()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--id", dest="ids", action="append", type=int, help="ID of the single company to delete")
    parser.add_argument("--name", dest="names", action="append", help="Exact name of the single company to delete")
    parser.add_argument("--yes", action="store_true", help="Confirm deletion (required; otherwise dry run)")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="Optional API base URL to probe DELETE /api/companies/{id} before direct DB cascade",
    )
    parser.add_argument("--database-url", default=None, help="Override SQLAlchemy database URL")
    args = parser.parse_args(list(argv) if argv is not None else None)

    ids = args.ids or []
    names = args.names or []
    if len(ids) + len(names) != 1:
        raise SystemExit(
            "Refusing to run: provide exactly one --id or one --name (single-company guard)."
        )

    session = _open_session(args.database_url)
    try:
        reset_company(
            session,
            company_id=ids[0] if ids else None,
            name=names[0] if names else None,
            yes=args.yes,
            base_url=args.base_url or None,
        )
    except ResetError as exc:
        raise SystemExit(str(exc)) from exc
    finally:
        session.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
