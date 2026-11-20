"""Phase 8b - internal document upload (TXT and CSV only, 2 MB cap).

Uploads are labelled "user-provided" everywhere, stored as an `internal` source,
and become records immediately (there is no URL to crawl). They are still subject
to the same analysis and ranking as crawled material, and the analysis prompt
marks them as user-provided so the model never mistakes them for verified web data.
"""

from __future__ import annotations

import hashlib
import io
import re

from sqlalchemy import select

from db import Record, Source

MAX_UPLOAD_BYTES = 2 * 1024 * 1024
ALLOWED_EXTENSIONS = (".txt", ".csv")
MIN_TEXT_CHARS = 40


class UploadError(ValueError):
    pass


def _sanitise(filename: str) -> str:
    base = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    return re.sub(r"[^A-Za-z0-9._ -]", "_", base)[:120] or "upload.txt"


def validate_upload(filename: str, raw: bytes) -> tuple[str, str]:
    """Return (clean filename, extracted text) or raise UploadError."""
    name = _sanitise(filename)
    lower = name.lower()
    if not lower.endswith(ALLOWED_EXTENSIONS):
        raise UploadError("only .txt and .csv files are accepted")
    if not raw:
        raise UploadError("file is empty")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise UploadError(f"file is larger than the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit")

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = raw.decode("latin-1")
        except UnicodeDecodeError as exc:
            raise UploadError("file is not readable text") from exc

    if "\x00" in text:
        raise UploadError("file contains binary data")

    if lower.endswith(".csv"):
        import pandas as pd

        try:
            frame = pd.read_csv(io.StringIO(text))
        except Exception as exc:
            raise UploadError(f"CSV could not be parsed: {exc.__class__.__name__}") from exc
        if frame.empty or frame.shape[1] < 2:
            raise UploadError("CSV must have a header and at least two columns")
        # Flatten to text lines so the analyser sees labelled values, not a blob.
        lines = [", ".join(str(col) for col in frame.columns)]
        for _, row in frame.head(2000).iterrows():
            lines.append(", ".join(f"{col}: {row[col]}" for col in frame.columns))
        text = "\n".join(lines)

    text = text.strip()
    if len(text) < MIN_TEXT_CHARS:
        raise UploadError(f"file has less than {MIN_TEXT_CHARS} characters of text")
    return name, text


def store_document(db, company, filename: str, raw: bytes) -> dict:
    name, text = validate_upload(filename, raw)
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()

    existing = db.scalar(
        select(Record.id).where(Record.company_id == company.id, Record.content_hash == digest).limit(1)
    )
    if existing is not None:
        raise UploadError("this exact document was already uploaded")

    source = Source(
        company_id=company.id,
        name=f"user-provided: {name}",
        url=f"upload://{company.id}/{name}",
        category="internal",
        reason="Uploaded by the user. Not independently verified.",
        expected="Context the founder wants the analysis to consider.",
        reliability=0.4,
        status="approved",
        health="ok",
    )
    db.add(source)
    db.flush()

    record = Record(
        company_id=company.id,
        source_id=source.id,
        url=source.url,
        title=f"[user-provided] {name}",
        text=text,
        content_hash=digest,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "document_id": record.id,
        "source_id": source.id,
        "filename": name,
        "characters": len(text),
        "records_created": 1,
        "label": "user-provided",
    }


def list_documents(db, company) -> list[dict]:
    rows = db.execute(
        select(Record, Source)
        .join(Source, Record.source_id == Source.id, isouter=True)
        .where(Record.company_id == company.id, Source.category == "internal")
        .order_by(Record.id.desc())
    ).all()
    return [
        {
            "record_id": record.id,
            "source_id": record.source_id,
            "filename": record.title.replace("[user-provided] ", ""),
            "characters": len(record.text),
            "discovered": record.discovered.isoformat() if record.discovered else None,
            "analysed": record.analysis is not None,
        }
        for record, _source in rows
    ]
