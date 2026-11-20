# Signal Stack

AI company-intelligence engine for the EDXSO AI Engineer Intern assignment (Assignment 1).

Enter a company name and website. Signal Stack researches the company from its own website, interviews the
founder with company-specific questions, discovers and *verifies* public sources in four categories
(customers, competitors, market, internal), crawls them, extracts evidence-backed signals, ranks them with a
deterministic formula, and writes a Monday Morning Brief.

Every signal cites a stored URL, a content hash and a verbatim snippet. Nothing in the intelligence is invented:
if the pipeline cannot verify it, it is dropped or explicitly labelled unverified.

> **Honesty status.** The build environment for this repository had no outbound internet access to company
> websites or to `api.groq.com`, and no `GROQ_API_KEY`. The code, tests and UI were built and verified there
> (117 backend tests, TypeScript type check, all six UI routes rendered against the live API). The real-data
> runs required by acceptance criteria AC2–AC6, AC10, AC11 and the count targets have **not** been executed yet.
> `docs/acceptance.md` marks each criterion PASS / FAIL / **NOT VERIFIED** with the reason. Run
> `scripts/run_three_companies.py` on a machine with internet + a Groq key, then fill in the counts table below.

## Quick start (from scratch)

Requirements: Python 3.11+ (developed on 3.11.2; 3.12 is the PRD target and works the same), Node 20+.

```bash
git clone <this repo> && cd signal-stack

# 1. secrets
cp .env.example .env
#    then edit .env and set GROQ_API_KEY=...
#    free key: https://console.groq.com/keys   (model default: llama-3.3-70b-versatile)

# 2. backend
python3 -m venv .venv
./.venv/bin/pip install -r backend/requirements.txt
cd backend
../.venv/bin/uvicorn main:app --reload --port 8000
#    API docs: http://127.0.0.1:8000/docs
#    health:   http://127.0.0.1:8000/api/health

# 3. frontend (second terminal)
cd frontend
npm install
npm run dev          # http://localhost:3000  (proxies /api to the backend)

# 4. tests
cd backend && ../.venv/bin/pytest -q
cd frontend && npx tsc --noEmit
```

Optional: `ENABLE_SCHEDULER=1` in `.env` makes the backend run APScheduler (weekly brief Monday 06:00 UTC,
source audit on the 1st). CI uses `.github/workflows/weekly.yml` instead.

### Run the three demo companies

```bash
# backend running, .env has a key
./.venv/bin/python scripts/run_three_companies.py --yes
# single company, skipping the interactive interview
./.venv/bin/python scripts/run_three_companies.py --only meetuniversity --skip-interview --yes
# the MeetUniversity context change from the PRD
./.venv/bin/python scripts/run_three_companies.py --only meetuniversity --skip-interview --yes \
  --reassess meetuniversity \
  --context "International student recruitment and overseas education consultancy"
```

The demo companies live in `scripts/demo_companies.json` **as data**. No company name, competitor or source URL
appears in application logic — that is what AC1 checks.

## What the pipeline does

| Step | Module | Calls LLM? | What it guarantees |
|---|---|---|---|
| Research | `backend/research.py` | yes | Homepage + up to 5 internal pages fetched; facts citing an unfetched URL are demoted to `unverified` |
| Interview | `backend/interview.py` | yes | 10 questions from the profile; follow-up only after a vague answer (max 3, never a repeat); skip/edit/resume/complete |
| Discovery | `backend/discovery.py` | yes | Every candidate URL is fetched; unreachable/blocked/duplicate candidates are dropped with a reason; RSS autodiscovery |
| Crawl | `backend/crawler.py` | **no** | Approved sources only, conditional GET, 3 MB cap, 1 req/s/host, hash dedup, `[UPDATED]` records, per-source error state |
| Analyse | `backend/analysis.py` | yes | Evidence snippet must appear verbatim in the text, otherwise strength is capped at 0.2 and flagged |
| Rank | `backend/ranking.py` | **no** | 100 × Σ(weight × component); components and an explanation string are stored |
| Brief | `backend/brief.py` | yes | 11 fixed sections; every citation id validated against the DB; actions without evidence dropped |
| Reassess | `backend/context.py` | yes | Relevance re-scored against the new context; < 0.4 only *recommends* removal, never deletes |

## API (prefix `/api`, 30 paths, all live in `/docs`)

Companies: `POST/GET /companies`, `GET/PATCH /companies/{id}`, `POST /companies/{id}/research`
Profile: `GET|PATCH /companies/{id}/profile`
Interview: `POST .../interview/start`, `GET .../interview`, `POST .../interview/answer`, `PATCH /interview/answers/{id}`, `POST .../interview/complete`
Sources: `GET .../sources`, `POST .../sources/discover`, `POST .../sources`, `PATCH /sources/{id}`, `DELETE /sources/{id}`, `POST /sources/{id}/approve`
Crawl: `POST .../crawl`, `POST .../analyse`, `GET .../crawl-history`, `GET .../intelligence`, `GET /signals/{id}`
Documents: `POST|GET .../documents`
Reports: `POST .../reports/generate`, `GET .../reports`, `GET /reports/{id}`, `GET /reports/{id}/export`, `PATCH /reports/{id}/actions/{index}`
Automation: `POST .../automation/run`, `POST .../source-audit`, `GET .../job-logs`
Context: `POST .../context/reassess`
System: `GET /health`, `GET /llm/healthcheck`

All list endpoints take `limit` and `offset`. All errors return JSON `{"detail": ...}`.

## Actual counts

Fill this in after your run; the PRD targets are 20 approved sources for MeetUniversity, 5–10 competitors and
30 records across the three demos. Do not inflate.

| Company | Sources stored (approved) | by category (cust/comp/market/internal) | Records analysed | Briefs |
|---|---|---|---|---|
| MeetUniversity | not run yet | — | — | — |
| Razorpay | not run yet | — | — | — |
| Zomato | not run yet | — | — | — |

## Non-goals (deliberately out of scope)

Multi-user auth, billing, multi-tenant isolation. Browser rendering of JavaScript-heavy sites. PDF export,
Alembic migrations, the full normalised 18-table schema. Bypassing paywalls, logins, CAPTCHAs or robots.txt.
Full limitations are in [`docs/limitations.md`](docs/limitations.md).

## Docs

- [`docs/PRD.md`](docs/PRD.md) — binding scope
- [`docs/architecture.md`](docs/architecture.md) — modules, data model, request flows
- [`docs/limitations.md`](docs/limitations.md) — every known gap, honestly
- [`docs/demo-script.md`](docs/demo-script.md) — 5–10 minute walkthrough
- [`docs/acceptance.md`](docs/acceptance.md) — AC1–AC12 with evidence and current status
- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) — the rules this repo was built under
