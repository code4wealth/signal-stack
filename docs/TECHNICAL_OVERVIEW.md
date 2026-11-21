# Signal Stack — Technical Overview

**Version:** Assignment 1 Compliance Baseline (2026-11-20)  
**Stack:** Next.js 15 + React 19 (frontend) · FastAPI + SQLAlchemy 2.0 + SQLite/PostgreSQL (backend) · Groq LLM · APScheduler + GitHub Actions

---

## 1. System Architecture

Signal Stack is a two-tier web application designed for complete traceability from public web pages and founder-uploaded documents to an executive Monday Morning Brief:

```
Next.js UI (port 3000) ──[/api/* proxy]──▶ FastAPI (port 8000)
                                              ├── SQLAlchemy ORM (SQLite / Postgres)
                                              ├── safe_fetch.py (single outbound HTTP boundary)
                                              ├── llm.py (Groq JSON + Pydantic validation)
                                              └── scheduler.py (APScheduler + .scheduler.lock)
```

Every pipeline stage writes durable state to the database (`companies`, `qa`, `sources`, `records`, `reports`, `job_logs`, plus `automation_schedules`, `automation_runs`, `automation_overrides`). Crawling is decoupled from LLM inference so network collection continues even if the LLM provider is rate-limited or offline. All browser-facing requests proxy through Next.js (`proxyTimeout: 300000`) or target `NEXT_PUBLIC_API_URL` directly.

---

## 2. Company Research & Source Discovery

1. **Company Research (`backend/research.py`):** Given a company name, website URL, and founder context, `research.py` fetches the homepage (falling back symmetrically between `www.` and apex domains on failure, and probing up to 4 info paths such as `/about` and `/pricing` when the homepage is an SPA shell). HTML, `<meta>` tags, and JSON-LD blocks are extracted cleanly. Every extracted company profile fact (`products`, `customers`, `geography`, `differentiators`) must cite an `evidence_url` that was actually fetched during the run; any fact whose URL was not fetched is demoted to `unverified`.
2. **Adaptive Founder Interview (`backend/interview.py`):** Generates 10 company-specific questions from the researched profile, stores each answer in `qa` (surviving server restarts), detects vague answers (`is_vague()`), and asks up to 3 targeted follow-ups without duplicating prior questions.
3. **Source Discovery & Verification (`backend/discovery.py`):** The LLM proposes candidate sources across four categories (`customers`, `competitors`, `market`, `internal`), plus competitor profiles (`backend/competitors.py`). **No candidate source or competitor is stored as verified until `safe_fetch.check_reachable` confirms a real HTTP 2xx response** and checks for RSS/Atom feeds. Unreachable or blocked candidates are dropped and logged transparently.

---

## 3. Crawling, Compliance & Internal Uploads

All outbound HTTP traffic passes exclusively through `backend/safe_fetch.py`:

- **SSRF Protection:** Only `http`/`https` schemes without embedded credentials are permitted. Hostnames are resolved via `dns_resolve()` and checked against loopback, private, link-local, multicast, reserved, and cloud-metadata IP ranges (`169.254.169.254`, `100.100.100.200`, etc.) **on initial request and on every manual redirect hop** (capped at 5 hops).
- **Compliance & Honest Identity:** Requests always send the honest `SignalStackBot` User-Agent, check and cache `robots.txt` per origin, and enforce a per-host rate limit (default 1 req/s). HTTP/2 (`h2`) is enabled with fallback to HTTP/1.1 `Connection: close` on transient protocol disconnects—**without** `curl_cffi` TLS impersonation or browser User-Agent spoofing. Sites returning `401`/`403`/`406`/`451` fail loudly as `"site blocked automated access"`, and slow-drip tarpits abort cleanly at the 30 s per-page wall-clock deadline.
- **Conditional GET & Deduplication (`backend/crawler.py`):** Approved sources store `etag` and `last_modified` headers and receive `304 Not Modified` when unchanged. Downloaded text is extracted via `trafilatura` / `feedparser`, whitespace-normalised, and hashed with SHA-256 (`records.content_hash`). Re-crawling identical content skips duplicates (`new_records == 0`), while changed content at an existing URL inserts an `[UPDATED]` record.
- **Internal Uploads (`backend/documents.py`):** Supports `.txt`, `.csv`, `.xlsx` (`openpyxl`), and text `.pdf` (`pymupdf`) up to **2 MB**, enforcing both extension checks and magic-byte validation (`%PDF-`, `PK\x03\x04`, non-binary UTF-8/latin-1). All uploaded records are stored under category `internal`, labelled `"user-provided"`, and grouped into complaints, objections, lost-deal reasons, and product requests.

---

## 4. Transparent Deterministic Ranking

Ranking (`backend/ranking.py`) is **100% deterministic Python**, never an LLM black box. Each analysed record receives a `0–100` score computed from six stored weighted components:

- **Relevance** (from LLM + context alignment), **Impact**, **Urgency**, **Source Reliability** (`0.4–0.9`), **Freshness** (time decay from `published`/`discovered`), and **Evidence Verbatim Strength** (capped at `0.2` if the verbatim snippet is not found in the source text).

Every record stores its component breakdown, weights, and a human-readable `explanation` string surfaced in the Signals view and Brief. Founder context reassessment (`POST /api/companies/{id}/context/reassess`) adjusts relevance scores with explicit reasons and flags low-relevance items (`< 0.4`) as recommendations—never deleting historical data.

---

## 5. Grounded AI Analysis & Monday Brief Synthesis

1. **Per-Record Analysis (`backend/analysis.py`):** Untrusted scraped/uploaded text is wrapped in `<untrusted_source>` delimiters and sent to Groq (`llm.py`) with strict Pydantic JSON validation (`AnalysisOut`). Every claim includes a verbatim quote checked directly against the stored record text; mismatches are flagged and penalized in ranking.
2. **Monday Morning Brief (`backend/brief.py`, `backend/brief_api.py`):** Builds 11 structured sections covering Executive Summary, Company Snapshot, Customer Signals, Competitor Moves, Market & Regulatory Shifts, Founder Intelligence, Top Five Developments (ranked by code), Strategic Implications & Structured `Opportunities`, Risks & Watchlist, Recommended Actions, and Sources & Method + Record Index.
   - **Zero-Hallucination Citation Guard:** Any record ID returned by the LLM that does not exist in the company's database set is stripped; any recommended action or opportunity left without valid database evidence is dropped (with drop counts logged).
   - **Honest Empty States:** Categories without verified records emit `"No meaningful verified development was identified during this monitoring period."` Structured `Opportunities` require `evidence`, `business_relevance`, `impact`, `next_step`, and `priority`; when fewer than 3 qualify, the brief states the exact count and why without padding.
   - **Exports:** Briefs support in-app review, Markdown (`.md`) download, clipboard Copy, and browser Print → Save as PDF (server `/pdf` returns `501` by design).

---

## 6. Scheduling, Settings & Automation

- **Workspace Settings (`GET/PATCH /api/companies/{id}/settings`, `/company/<id>/settings`):** Persists briefing day/time, IANA timezone, monitoring frequency (`6h`/`12h`/`daily`/`weekly`), source refresh cadence, monthly source-health audit day, and company profile, syncing directly to `automation_schedules`.
- **In-Process Scheduler (`backend/scheduler.py`, `backend/automation.py`):** Protected by an exclusive OS file lock (`.scheduler.lock`). `ENABLE_SCHEDULER=0` is the safe default; the Automation UI honestly displays **"Scheduler is off"** and marks unexecuted past slots `"Scheduler off"` rather than falsely reporting `"Missed"`. Passing `ENABLE_SCHEDULER=1` (or `scripts\start_local.ps1 -EnableScheduler`) activates APScheduler.
- **Scheduled Workflows (`.github/workflows/weekly.yml`):** Runs weekly briefs (Monday 07:00 IST / 01:30 UTC) and monthly source audits (1st of month, 07:30 IST) via `run_weekly.py` and `run_audit.py`. Note: GitHub-hosted runners use ephemeral SQLite unless `DATABASE_URL` points to an external Postgres instance.

---

## 7. Reliability, Security & Verification

- **Failure Isolation:** Per-record analysis failures are isolated and logged; `MAX_ANALYSES_PER_RUN=40` and exponential backoff protect Groq free-tier quotas. TLS verification honours `SSL_CERT_FILE`, OS trust stores (`truststore`), and `certifi`.
- **Automated Verification:** **209 backend tests** (`pytest -q` covering SSRF, honest UA, `.xlsx`/`.pdf` uploads, ranking, brief citations, settings, scheduler honesty, canonical deduplication, and `scripts/export_reports.py`), **5 frontend tests** (`npm test`), TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), and Next.js production build (`npm run build`).
- **Reporting Utility:** `scripts/export_reports.py` reads directly from the database (without inventing counts) to generate `docs/sample_reports/<company>.md` (latest brief + evidence appendix) and `docs/sample_reports/SUMMARY.md`.
