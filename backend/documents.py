"""Phase 8b - internal document upload (TXT, CSV, XLSX, PDF; 2 MB cap).

Uploads are labelled "user-provided" everywhere, stored as an `internal` source,
and become records immediately (there is no URL to crawl). They are still subject
to the same analysis and ranking as crawled material, and the analysis prompt
marks them as user-provided so the model never mistakes them for verified web data.
"""

from __future__ import annotations

import hashlib
import io
import re
import zipfile

from sqlalchemy import select

from db import Record, Source

MAX_UPLOAD_BYTES = 2 * 1024 * 1024
ALLOWED_EXTENSIONS = (".txt", ".csv", ".xlsx", ".pdf")
MIN_TEXT_CHARS = 40
MAX_PDF_PAGES = 200
MAX_EXTRACTED_CHARS = 400_000
DOCUMENT_TYPES = ("general", "support_tickets", "sales_objections", "lost_deals", "product_requests")

_INSIGHT_PATTERNS = {
    "complaints": ("complaint", "bug", "broken", "fail", "slow", "error", "login loop", "timeout", "issue", "problem"),
    "objections": ("objection", "expensive", "price", "pricing", "cost", "budget", "too high", "concern", "hesitant"),
    "lost_deal_reasons": ("lost", "churn", "cancelled", "canceled", "competitor", "switched", "missing"),
    "product_requests": ("feature", "request", "wish", "need", "support for", "integration", "filter", "export"),
}


class UploadError(ValueError):
    pass


def extract_internal_insights(text: str, document_type: str = "general") -> dict:
    """Deterministically group lines from user-provided documents without inventing text."""
    buckets: dict[str, list[str]] = {
        "complaints": [],
        "objections": [],
        "lost_deal_reasons": [],
        "product_requests": [],
    }
    type_default_bucket = {
        "support_tickets": "complaints",
        "sales_objections": "objections",
        "lost_deals": "lost_deal_reasons",
        "product_requests": "product_requests",
    }
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or len(line) < 12:
            continue
        lower = line.lower()
        # Skip pure CSV header lines
        if "," in line and ":" not in line and any(h in lower for h in ("ticket_id", "category,")):
            continue
        matched = False
        for bucket, terms in _INSIGHT_PATTERNS.items():
            if any(term in lower for term in terms):
                if len(buckets[bucket]) < 10 and line not in buckets[bucket]:
                    buckets[bucket].append(line[:280])
                matched = True
        if not matched and document_type in type_default_bucket:
            default_bucket = type_default_bucket[document_type]
            if len(buckets[default_bucket]) < 10 and line not in buckets[default_bucket]:
                buckets[default_bucket].append(line[:280])
    return {
        **buckets,
        "counts": {key: len(items) for key, items in buckets.items()},
        "label": "user-provided",
    }


def _sanitise(filename: str) -> str:
    base = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    return re.sub(r"[^A-Za-z0-9._ -]", "_", base)[:120] or "upload.txt"


def _extract_pdf_text(raw: bytes) -> str:
    if not raw.lstrip(b"\xef\xbb\xbf \t\r\n").startswith(b"%PDF-"):
        raise UploadError("file content does not match .pdf header (%PDF-)")
    try:
        import fitz
    except ImportError as exc:  # pragma: no cover - installed in requirements
        raise UploadError("PDF support is not installed on the server") from exc

    try:
        doc = fitz.open(stream=raw, filetype="pdf")
    except Exception as exc:
        raise UploadError(f"PDF could not be parsed: {exc.__class__.__name__}") from exc

    try:
        if doc.is_encrypted and not doc.authenticate(""):
            raise UploadError("encrypted PDFs are not supported")
        parts: list[str] = []
        total_len = 0
        for page_index in range(min(len(doc), MAX_PDF_PAGES)):
            page_text = (doc.load_page(page_index).get_text("text") or "").strip()
            if page_text:
                parts.append(page_text)
                total_len += len(page_text)
                if total_len >= MAX_EXTRACTED_CHARS:
                    break
        text = "\n\n".join(parts)[:MAX_EXTRACTED_CHARS].strip()
    except UploadError:
        raise
    except Exception as exc:
        raise UploadError(f"PDF text extraction failed: {exc.__class__.__name__}") from exc
    finally:
        doc.close()

    if len(text) < MIN_TEXT_CHARS:
        raise UploadError(
            f"PDF has less than {MIN_TEXT_CHARS} characters of extractable text (scanned images without OCR are not supported)"
        )
    return text


def _extract_xlsx_text(raw: bytes) -> str:
    if not raw.startswith(b"PK\x03\x04"):
        raise UploadError("file content does not match .xlsx archive signature")
    try:
        import openpyxl
    except ImportError as exc:  # pragma: no cover - installed in requirements
        raise UploadError("Excel (.xlsx) support is not installed on the server") from exc

    try:
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except (zipfile.BadZipFile, Exception) as exc:
        raise UploadError(f"XLSX could not be parsed: {exc.__class__.__name__}") from exc

    lines: list[str] = []
    try:
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            rows_iter = ws.iter_rows(values_only=True)
            headers: list[str] | None = None
            sheet_lines: list[str] = []
            for row in rows_iter:
                cleaned = ["" if v is None else str(v).strip() for v in row]
                if not any(cleaned):
                    continue
                if headers is None:
                    headers = [h or f"col_{idx + 1}" for idx, h in enumerate(cleaned)]
                    sheet_lines.append(", ".join(headers))
                else:
                    pairs = []
                    for idx, val in enumerate(cleaned):
                        if not val:
                            continue
                        col = headers[idx] if idx < len(headers) else f"col_{idx + 1}"
                        pairs.append(f"{col}: {val}")
                    if pairs:
                        sheet_lines.append(", ".join(pairs))
                if len(sheet_lines) >= 2000:
                    break
            if sheet_lines:
                lines.append(f"[Sheet: {sheet_name}]")
                lines.extend(sheet_lines)
    except Exception as exc:
        raise UploadError(f"XLSX could not be read: {exc.__class__.__name__}") from exc
    finally:
        wb.close()

    text = "\n".join(lines)[:MAX_EXTRACTED_CHARS].strip()
    if len(text) < MIN_TEXT_CHARS:
        raise UploadError(f"XLSX has less than {MIN_TEXT_CHARS} characters of text")
    return text


def validate_upload(filename: str, raw: bytes) -> tuple[str, str]:
    """Return (clean filename, extracted text) or raise UploadError."""
    name = _sanitise(filename)
    lower = name.lower()
    if not lower.endswith(ALLOWED_EXTENSIONS):
        raise UploadError("only .txt, .csv, .xlsx, and .pdf files are accepted")
    if not raw:
        raise UploadError("file is empty")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise UploadError(f"file is larger than the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit")

    if lower.endswith(".pdf"):
        return name, _extract_pdf_text(raw)
    if lower.endswith(".xlsx"):
        return name, _extract_xlsx_text(raw)

    if raw.lstrip(b"\xef\xbb\xbf \t\r\n").startswith(b"%PDF-") or raw.startswith(b"PK\x03\x04"):
        raise UploadError("file content does not match text/CSV extension")

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


def store_document(db, company, filename: str, raw: bytes, *, document_type: str = "general") -> dict:
    doc_type = document_type if document_type in DOCUMENT_TYPES else "general"
    name, text = validate_upload(filename, raw)
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()

    existing = db.scalar(
        select(Record.id).where(Record.company_id == company.id, Record.content_hash == digest).limit(1)
    )
    if existing is not None:
        raise UploadError("this exact document was already uploaded")

    insights = extract_internal_insights(text, doc_type)
    source = Source(
        company_id=company.id,
        name=f"user-provided: {name}",
        url=f"upload://{company.id}/{name}",
        category="internal",
        source_type="upload",
        description=f"document_type={doc_type}",
        reason="Uploaded by the user. Not independently verified.",
        expected="Context the founder wants the analysis to consider.",
        reliability=0.4,
        update_frequency="manual",
        status="approved",
        health="ok",
    )
    db.add(source)
    db.flush()

    record = Record(
        company_id=company.id,
        source_id=source.id,
        url=source.url,
        title=f"[user-provided:{doc_type}] {name}",
        text=text,
        content_hash=digest,
        scores={"document_type": doc_type, "insights": insights},
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "document_id": record.id,
        "source_id": source.id,
        "filename": name,
        "document_type": doc_type,
        "characters": len(text),
        "records_created": 1,
        "label": "user-provided",
        "insights": insights,
    }


def list_documents(db, company) -> list[dict]:
    rows = db.execute(
        select(Record, Source)
        .join(Source, Record.source_id == Source.id, isouter=True)
        .where(Record.company_id == company.id, Source.category == "internal")
        .order_by(Record.id.desc())
    ).all()
    items = []
    for record, source in rows:
        meta = record.scores or {}
        doc_type = meta.get("document_type")
        if not doc_type and source and (source.description or "").startswith("document_type="):
            doc_type = source.description.split("=", 1)[1]
        doc_type = doc_type or "general"
        insights = meta.get("insights") or extract_internal_insights(record.text, doc_type)
        clean_name = re.sub(r"^\[user-provided(?::[^\]]+)?\]\s*", "", record.title or "")
        items.append(
            {
                "record_id": record.id,
                "source_id": record.source_id,
                "filename": clean_name,
                "document_type": doc_type,
                "characters": len(record.text),
                "discovered": record.discovered.isoformat() if record.discovered else None,
                "analysed": record.analysis is not None,
                "insights": insights,
            }
        )
    return items
