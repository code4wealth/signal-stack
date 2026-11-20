# Signal Stack: Company Intelligence and Monday Brief Engine

AI-powered pipeline that researches a company, interviews its founder, discovers and verifies public intelligence
sources in four categories, crawls them, extracts evidence-backed signals, ranks them transparently, and writes an
executive Monday Morning Brief.

Built for the EDXSO AI Engineer Intern assignment (Assignment 1).
Demo companies (entered as data, not hardcoded): MeetUniversity, Razorpay, Zomato.

> **Build status.** Built & verified via 117 unit tests. Live pipeline execution is unverified in
> network-isolated environment; runnable locally via `scripts/run_three_companies.py` with `GROQ_API_KEY`.
> TypeScript type check is clean and all eight Next.js routes build. No intelligence data has been fabricated —
> PRD section 12.

## Results from live runs

> **No live run has completed yet.** Date of last verification attempt: **2026-11-20**.
> The build environment had no outbound access to company websites (all fetches returned a TLS transport error) and
> no `GROQ_API_KEY` (`/api/llm/healthcheck` → HTTP 503). The exact failure captured from a real attempt:
>
> ```
> POST /api/companies/1/research
> 502 {"detail": "Could not fetch any page from https://www.meetuniversity.com:
>      homepage: fetch: transport error: ConnectError: TLS/SSL connection has been closed (EOF)"}
>
> GET /api/llm/healthcheck
> 503 {"detail": "GROQ_API_KEY is not set. Add it to .env (see .env.example) and restart the server."}
> ```
>
> So the counts below are **not measured** and I will not invent them. The pipeline, UI and API were verified
> against a live server with mocked HTTP/LLM in tests (117 backend tests, TypeScript clean, six routes HTTP 200).

| Company | Verified sources | Competitors | Collected records | Brief generated |
|---|---|---|---|---|
| MeetUniversity | Not measured — sandbox egress blocked | Not measured | Not measured | no |
| Razorpay | Not measured — sandbox egress blocked | Not measured | Not measured | no |
| Zomato | Not measured — sandbox egress blocked | Not measured | Not measured | no |

Targets were 20 sources, 5 to 10 competitors and 30 records. Where I fell short: **everywhere, because the run has
not happened.** Cause: no network egress to the target sites and no Groq key in the build sandbox. To produce the
real numbers, run `scripts/run_three_companies.py` (see below) on a machine with internet and a key, then replace
this table with the printed output. Do not copy numbers from anywhere else.

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
../.venv/bin/uvicorn main:app --reload --port 8000
# API docs: http://127.0.0.1:8000/docs   health: http://127.0.0.1:8000/api/health

# frontend (new terminal)
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

Windows: use `.venv\Scripts\activate` and then `uvicorn main:app --reload --port 8000`; the venv path differs.
A venv inside `backend/` works equally well — `requirements.txt` lives there.

### Produce the real numbers

```bash
./.venv/bin/python scripts/run_three_companies.py --yes
# one company, skipping the interactive interview
./.venv/bin/python scripts/run_three_companies.py --only meetuniversity --skip-interview --yes
# the PRD context change
./.venv/bin/python scripts/run_three_companies.py --only meetuniversity --skip-interview --yes \
  --reassess meetuniversity \
  --context "International student recruitment and overseas education consultancy"
```
The companies live in `scripts/demo_companies.json` as data. No company name appears in backend logic (checked by grep).

## Environment variables

| Name | Purpose |
|---|---|
| `GROQ_API_KEY` | Groq API access (required for every LLM step) |
| `GROQ_MODEL` | Model name. Default `llama-3.3-70b-versatile`. **Check Groq's current free list** — see the warning below |
| `DATABASE_URL` | Optional. Defaults to `sqlite:///backend/signalstack.db`; any SQLAlchemy URL works |
| `BACKEND_URL` | Used by the Next.js dev server rewrite; defaults to `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_API_URL` | Optional absolute API base for a split deployment (empty = use the Next proxy) |
| `ENABLE_SCHEDULER` | `1` starts APScheduler in-process (default `0`, so `--reload` cannot double-schedule) |
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
cd backend && ../.venv/bin/pytest -q     # 117 passed
cd frontend && npx tsc --noEmit          # clean
cd frontend && npm run build             # all 8 routes built
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
