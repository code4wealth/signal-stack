# Signal Stack: Company Intelligence and Monday Brief Engine

AI-powered pipeline that researches a company, interviews its founder, discovers and verifies public intelligence
sources in four categories, crawls them, extracts evidence-backed signals, ranks them transparently, and writes an
executive Monday Morning Brief.

Built for the EDXSO AI Engineer Intern assignment (Assignment 1).
Demo companies (entered as data in `scripts/demo_companies.json`, not hardcoded): MeetUniversity, Razorpay, Zerodha.

> **Build & verification status.** Backend unit/API suite: **192 passed** (`pytest -q`, mocked HTTP/LLM for external calls), frontend Node suite: **5 passed** (`npm test`), TypeScript clean (`0` errors), ESLint clean (`0` warnings/errors), and all Next.js routes build. Partial live-run output from Windows (`ead1782`) is committed in `run_output.txt`.

## Results from live runs

Captured directly from committed `run_output.txt` (generated via `scripts/run_three_companies.py --skip-interview` on Windows; see `docs/acceptance.md` for what is settled vs still uncaptured):

| Company | Pages researched | Verified sources stored (dropped) | Crawled records | Analysed / Brief |
|---|---|---|---|---|
| **MeetUniversity** (`https://www.meetuniversity.com`) | 6 pages (3 unverified) | **5** (`competitors: 1, customers: 1, market: 3`; 10 dropped) | 5 new, 0 errors | 5 analysed, 0 flagged · **Brief #1 (3 actions)** |
| **Razorpay** (`https://razorpay.com`) | 6 pages (0 unverified) | **16** (15 dropped) | 23 new, 1 error | Not captured in `run_output.txt` |
| **Zerodha** (`https://zerodha.com`) | 6 pages (2 unverified) | Not captured in `run_output.txt` | Not captured in `run_output.txt` | Not captured in `run_output.txt` |

Targets were 20 sources, 5 to 10 competitors and 30 records. In `run_output.txt`, MeetUniversity completed end-to-end (research → discovery → crawl → analysis → brief #1) with 5 verified sources and 5 records; Razorpay reached 16 verified sources and 23 crawled records; Zerodha completed research; interviews (`--skip-interview`) and `--reassess` output were not captured in `run_output.txt`. To capture the remaining steps cleanly, re-run without `--skip-interview` and with `--reassess` (see below).

## Features

Implemented and tested:
- Company research from the public website, with verified vs unverified facts and evidence URLs
  (`research.py`; a fact whose `evidence_url` was not actually fetched is demoted to `unverified` — asserted in tests)
- Adaptive 10-question founder interview with follow-ups (vague answers only, max 3, duplicates rejected), skip, edit and resume
- Source discovery in four categories (Customers, Competitors, Market, Internal) with real URL verification; unreachable candidates are dropped and reported
- Crawler: RSS and pages, ETag and Last-Modified, retries with backoff, robots.txt, per-host rate limit, SSRF protection
- Content hashing, duplicate detection (URL + hash) and change detection (`[UPDATED]` records)
- Per-record analysis with a verbatim evidence check (mismatch caps evidence strength at 0.2 and flags it)
- Transparent ranking with stored components, weights and a per-record explanation string
- Monday Brief saved to the database, history, Markdown export, copy, action tracking (checkbox persisted in the report)
- Source management (approve, reject, pause, add, remove)
- Context reassessment (relevance re-scoring with reasons; below 0.4 is a recommendation only, never a delete)
- TXT and CSV internal document upload (2 MB cap, parsed, labelled user-provided)
- Weekly brief and monthly source audit via GitHub Actions plus a manual trigger and an in-app "Run now" button
- Job logs for every pipeline stage, surfaced in the Automation page

Not implemented (see `docs/COST_AND_LIMITATIONS.md`):
- PDF export and PDF/XLSX upload (only TXT and CSV uploads exist)
- JavaScript rendering of client-side sites
- Alembic migrations, the full normalised 18-table schema, multi-user auth, billing, multi-tenancy
- Sentence-level entailment for brief prose (only citation ids are validated, not whether each sentence follows from its record)
- Near-duplicate (syndicated) text detection — dedup is exact hash equality after whitespace normalisation
- Hosting/deployment of either service; action text editing (the `done` flag is editable, the label is not)
- Regenerating interview questions once an interview exists (deliberate: it would discard answers)
- Anti-bot / WAF bypass or browser User-Agent spoofing: sites that block or tarpit automated HTTP clients (for example with CDN challenges or stalled/trickled responses) hit the 30 s per-page / 5 min per-job wall-clock deadlines, save any completed pages as `unverified`, and fail with an explicit error rather than spoofing browser headers or ignoring `robots.txt`

## Architecture
```
Next.js UI  ->  FastAPI  ->  SQLite (SQLAlchemy)
                  |
   safe_fetch (SSRF, robots, rate limit)  ->  public web
                  |
   llm.py (Groq, Pydantic-validated JSON)
```
Pipeline: research, interview, discovery, crawl (no LLM), analyse, rank, brief.

Key decisions:
- Crawling is separate from AI analysis, so crawling works if the LLM is down.
- Every outbound request goes through one safe module (`backend/safe_fetch.py`).
- LLM output is always schema-validated. Scraped text is passed only as tagged untrusted data (`<untrusted_source>`).
- Ranking is deterministic code over stored components, not an LLM score.
- Report citations are validated against real database records; invented ids are stripped and empty sections fall
  back to the exact sentence required by the PRD.

More detail: [`docs/architecture.md`](docs/architecture.md).

## Prerequisites

Node 20+ and a free Groq API key.

**Python support.** Tested locally on Python 3.11. CI test matrix configured for Python 3.11 and 3.12 in
`.github/workflows/tests.yml`. The PRD targets 3.12; that interpreter could not be installed in the build sandbox
(no apt access, CPython downloads blocked), so 3.12 has **not** executed this code yet. The CI workflow is committed
and parses as valid YAML but has not had its first run — treat 3.12 as configured, not proven. A `GROQ_API_KEY` is
not needed for CI: LLM and HTTP are mocked.

## Setup

These are the exact commands used to verify this repository.

```bash
git clone <repo-url> && cd signal-stack

# backend
python3 -m venv .venv
./.venv/bin/pip install -r backend/requirements.txt
cp .env.example .env          # then add GROQ_API_KEY (repo root or backend/.env — both are read,
                             # repo root wins; a real env var beats both)
cd backend
../.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
# API docs: http://127.0.0.1:8000/docs   health: http://127.0.0.1:8000/api/health
# (Never use hot-reload here: SQLite writes to backend/signalstack.db* inside backend/
# can restart uvicorn mid-request and abort long requests with empty-body 502s.)

# frontend (new terminal)
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

### Windows setup

Requires **Python 3.11+** (the setup script checks `py -0p` and exits if none is installed).

**Full-`C:`-drive pitfall.** Both `py -m venv` (`ensurepip` unpacking bundled wheels) and `pip` write temporary
files to `%TEMP%` on `C:`. If `C:` is full, venv creation fails with exit status 1 and `pip` fails with
`OSError: [Errno 28] No space left on device`.

Run from the repository root (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup_windows.ps1
# Optional custom paths (defaults shown):
powershell -ExecutionPolicy Bypass -File scripts\setup_windows.ps1 -TempDir D:\Temp -CacheDir D:\pip-cache
```

`scripts\setup_windows.ps1` creates `TempDir`/`CacheDir`, sets `TEMP` and `TMP` for the session before creating
`backend\.venv`, falls back to `py -m venv --without-pip` plus `get-pip.py` if `ensurepip` fails, installs
`backend\requirements.txt` with `--cache-dir`, and copies `.env.example` to `.env` only when `.env` does not
exist. `setup_windows.ps1` is code-reviewed but not yet executed on Windows — first run is the verification.

To start the backend afterwards (explicitly bound to `127.0.0.1` so Windows `localhost` IPv6 `::1` cannot collide with Next's proxy, and without auto-reload so SQLite writes never restart the server mid-request):

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Or launch the full stack with network diagnostics and preflight verification:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start_local.ps1
```

(`dev.ps1` is also code-reviewed only on Linux and not yet executed on Windows.)

### Produce the real numbers

Run preflight first to confirm `.env` (`GROQ_API_KEY` — never printed), `GROQ_MODEL` via `/api/llm/healthcheck`,
backend (`127.0.0.1:8000`), frontend (`127.0.0.1:3000`), database state, and public internet egress all pass:

```bash
# 1. Verify everything is ready before spending Groq tokens
./.venv/bin/python scripts/preflight.py

# 2. Run the 3-company end-to-end pipeline and save the output
./.venv/bin/python scripts/run_three_companies.py --yes 2>&1 | tee run_output.txt

# Or one company, skipping the interactive interview:
./.venv/bin/python scripts/run_three_companies.py --only meetuniversity --skip-interview --yes

# The PRD context change:
./.venv/bin/python scripts/run_three_companies.py --only meetuniversity --skip-interview --yes \
  --reassess meetuniversity \
  --context "International student recruitment and overseas education consultancy"

# 3. Paste/commit the verified output into README.md, docs/acceptance.md, and exports/
```
The companies live in `scripts/demo_companies.json` as data. No company name appears in backend logic (checked by grep).

## Environment variables

| Name | Purpose |
|---|---|
| `GROQ_API_KEY` | Groq API access (required for every LLM step) |
| `GROQ_MODEL` | Model name. Default `llama-3.3-70b-versatile`. **Check Groq's current free list** — see the warning below |
| `DATABASE_URL` | Optional. Defaults to `sqlite:///backend/signalstack.db`; any SQLAlchemy URL works |
| `BACKEND_URL` | Used by the Next.js dev server rewrite; defaults to `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_API_URL` | Optional absolute API origin (e.g. `http://127.0.0.1:8000`) read from `frontend/.env*` or repo-root `.env` via `next.config.ts` to bypass the Next proxy. Manual check: open DevTools Network tab on `http://127.0.0.1:3000` and verify API calls target `http://127.0.0.1:8000/api/...` |
| `CORS_EXTRA_ORIGINS` | Comma-separated extra browser origins allowed by FastAPI (`http://127.0.0.1:3000` and `http://localhost:3000` are already allowed by default) |
| `ENABLE_SCHEDULER` | `1` starts APScheduler in-process (default `0`, protected by `.scheduler.lock` so only one scheduler can start) |
| `MAX_ANALYSES_PER_RUN` | Groq budget guard, default 40 |
| `CRAWL_CONCURRENCY` | Fetches in flight, capped at 4 |
| `SSL_CERT_FILE` | Optional CA bundle for TLS-inspecting networks (also reads `REQUESTS_CA_BUNDLE`, `CURL_CA_BUNDLE`). Unset = httpx default verification |
| `FETCH_TIMEOUT_SECONDS` / `FETCH_MAX_BYTES` / `FETCH_REQUESTS_PER_SECOND` | Fetcher limits, defaults 15 s / 3 MB / 1 per host-second |

> **Model warning (unverified here, 2026-11-20).** Published free-tier reports disagree about
> `llama-3.3-70b-versatile`: some list it as free with ~1,000 requests/day, at least one 2026 source says Llama 3.3
> moved to Enterprise and that the current free chat models are `openai/gpt-oss-120b`, `openai/gpt-oss-20b` and a
> Qwen model. I could not check `console.groq.com` from this environment. If your first LLM call returns a 404/403
> model error, set `GROQ_MODEL` to a model listed on Groq's models page and restart. Nothing else needs to change.

## Database

Six tables (`companies`, `qa`, `sources`, `records`, `reports`, `job_logs`) are created automatically on startup via
`create_all` with `ON DELETE CASCADE` foreign keys and indexes on `company_id`, `records.content_hash` and
`records.total`. Alembic is not used in this build; the migration story is "delete the SQLite file, or point
`DATABASE_URL` at Postgres, and let `create_all` rebuild".

## Tests

```bash
cd backend && ../.venv/bin/pytest -q     # 192 passed
cd frontend && npm test                  # 5 passed
cd frontend && npx tsc --noEmit          # clean
cd frontend && npm run lint              # clean
cd frontend && npm run build             # production build clean
```

LLM calls and HTTP are mocked in tests. Fixtures are labelled `TEST_` and are never stored as intelligence records.

**Do not run `npm run build` while `npm run dev` is serving.** Both write to `frontend/.next`, and the build replaces
the dev server's chunks — every page then fails with `Cannot find module './<hash>.js'` (HTTP 500) until you
`rm -rf frontend/.next` and restart `npm run dev`. Order the checks as: dev-server demo first, `npm run build` last,
then delete `.next` and restart dev if you need the UI again.

CI: `.github/workflows/tests.yml` (pytest on Python 3.11 **and** 3.12, then `tsc --noEmit` and `npm run build`).
Status: **not run yet** — the workflow exists and is valid YAML, but no Actions run has executed it.

## Scheduler

- Weekly brief: `.github/workflows/weekly.yml`, Monday **07:00 IST (01:30 UTC)**, also runnable via
  `workflow_dispatch` and via `python backend/run_weekly.py --all`.
- Monthly audit: same workflow, `cron: 30 1 1 * *` (1st of the month, 07:30 IST), or `python backend/run_audit.py --all`,
  or `POST /api/companies/{id}/source-audit` from the UI's Automation page.
- Local: `ENABLE_SCHEDULER=1` registers both jobs with APScheduler while the server runs.
- Persistence caveat: GitHub-hosted runners are ephemeral, so each scheduled run starts from an empty SQLite unless
  `DATABASE_URL` points at a real Postgres (a Supabase free-tier database works) and is stored as a repository
  secret. The workflow uploads the database file and job output as artifacts either way. **The scheduled run itself
  is not verified** — it needs a repository with secrets configured.
- Failures are written to `job_logs` and shown on the Automation page. Verified locally: running the weekly job and
  the audit through the API produced four `job_logs` rows (`crawl: skipped`, `analyse: ok`, `weekly: partial`,
  `source_audit: ok`).

## Deployment

Not deployed. Both services were run locally only: uvicorn on :8000 and `next dev` on :3000. For a split deployment,
set `NEXT_PUBLIC_API_URL` to the backend origin and add that origin to the backend's CORS allow-list
(`CORS_EXTRA_ORIGINS`). Check each platform's current free-tier limits before relying on them; none were used.

## Security

SSRF blocking (private, loopback, link-local, reserved and cloud-metadata IPs, plus literal hostnames like
`metadata.google.internal`), per-hop redirect re-validation, robots.txt compliance, 1 req/s per host, size and
timeout caps, upload validation (extension, size, decodability, NUL bytes), secrets only in environment variables,
and prompt-injection mitigation by tagging crawled content as untrusted data that never enters a system prompt.

Known gap: DNS rebinding between the resolution check and the TCP connect. Full list in
[`docs/COST_AND_LIMITATIONS.md`](docs/COST_AND_LIMITATIONS.md).

## Documentation

`docs/PRD.md`, `docs/architecture.md`, `docs/DEMO_SCRIPT.md`, `docs/COST_AND_LIMITATIONS.md`,
`docs/acceptance.md` (AC1–AC12 with evidence and current status).
