"""Database models and session management.

Six tables per PRD section 6. SQLite by default; the engine is created from a
SQLAlchemy URL so Postgres is a config change (DATABASE_URL), not a rewrite.
JSON columns are used for profile/analysis/scores/report content because of the
time budget - see docs/COST_AND_LIMITATIONS.md.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterator

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker
from sqlalchemy.pool import StaticPool

from config import get_settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    website: Mapped[str] = mapped_column(String(500), nullable=False)
    context: Mapped[str] = mapped_column(Text, default="", nullable=False)
    profile: Mapped[dict | None] = mapped_column(JSON, default=None, nullable=True)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    qa: Mapped[list["QA"]] = relationship(back_populates="company", cascade="all, delete-orphan")


class QA(Base):
    """One interview question/answer slot for a company."""

    __tablename__ = "qa"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    idx: Mapped[int] = mapped_column(Integer, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, default=None, nullable=True)
    skipped: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_followup: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    company: Mapped[Company] = relationship(back_populates="qa")

    __table_args__ = (Index("ix_qa_company_id", "company_id"),)


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    feed_url: Mapped[str | None] = mapped_column(String(1000), default=None, nullable=True)
    # customers | competitors | market | internal
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str] = mapped_column(Text, default="", nullable=False)
    expected: Mapped[str] = mapped_column(Text, default="", nullable=False)
    reliability: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    # pending | approved | rejected | paused
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    health: Mapped[str] = mapped_column(String(16), default="unknown", nullable=False)
    relevance: Mapped[float | None] = mapped_column(Float, default=None, nullable=True)
    relevance_reason: Mapped[str | None] = mapped_column(Text, default=None, nullable=True)
    etag: Mapped[str | None] = mapped_column(String(300), default=None, nullable=True)
    last_modified: Mapped[str | None] = mapped_column(String(120), default=None, nullable=True)
    last_checked: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    last_ok: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    last_error: Mapped[str | None] = mapped_column(Text, default=None, nullable=True)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (Index("ix_sources_company_id", "company_id"),)


class Record(Base):
    """A crawled document plus its analysis and scores."""

    __tablename__ = "records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("sources.id", ondelete="SET NULL"), default=None, nullable=True
    )
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    title: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    published: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    discovered: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    analysis: Mapped[dict | None] = mapped_column(JSON, default=None, nullable=True)
    scores: Mapped[dict | None] = mapped_column(JSON, default=None, nullable=True)
    total: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    is_update: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (
        Index("ix_records_company_id", "company_id"),
        Index("ix_records_content_hash", "content_hash"),
        Index("ix_records_total", "total"),
    )


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    content: Mapped[dict] = mapped_column(JSON, nullable=False)
    markdown: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (Index("ix_reports_company_id", "company_id"),)


class JobLog(Base):
    __tablename__ = "job_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), default=None, nullable=True
    )
    job: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    detail: Mapped[str] = mapped_column(Text, default="", nullable=False)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (Index("ix_job_logs_company_id", "company_id"),)


settings = get_settings()

_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
_engine_kwargs: dict = {"connect_args": _connect_args, "future": True}
if settings.database_url in ("sqlite://", "sqlite:///:memory:"):
    _engine_kwargs["poolclass"] = StaticPool

engine = create_engine(settings.database_url, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    """Enforce ON DELETE CASCADE and sane concurrency on SQLite."""
    if settings.database_url.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
