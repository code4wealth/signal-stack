# Acceptance criteria — status and evidence

**Accepted offline baseline, 2026-11-20.** The build environment has no outbound network access (see
`docs/COST_AND_LIMITATIONS.md` → "Sandbox network constraint") and no `GROQ_API_KEY`. Everything that can be verified
without network egress is verified here. Everything that cannot is marked FAIL/UNVERIFIED with the command that
would settle it.

**Level column:**
- **verified** — the check itself ran and the output is quoted.
- **code level** — covered by unit/API tests that executed; the live counterpart has not run.
- **blocked** — needs internet and/or a Groq key; cannot be claimed.

## Environment evidence (measured 2026-11-20)

```
curl https://api.groq.com/openai/v1/models      -> HTTP 000 (no connection)
curl https://www.meetuniversity.com             -> HTTP 000
GET  /api/llm/healthcheck                       -> 503 {"detail":"GROQ_API_KEY is not set. ..."}
# with a key present (checked 2026-11-20):
GET  /api/health                                -> llm.api_key_configured: true
GET  /api/llm/healthcheck                       -> 503 {"detail":"Groq request failed after 2 attempts: APIConnectionError"}
POST /api/companies/1/research                  -> 502 {"detail":"... ConnectError: TLS/SSL connection has been closed (EOF)"}
python scripts/run_three_companies.py --only meetuniversity --yes  -> exit code 1 at research
```

## Criteria

| # | Criterion | Status | Level | Evidence |
|---|---|---|---|---|
| AC1 | Creating a company never uses hardcoded competitors or sources | **PASS** | verified | `grep -rlEi "meetuniversity\|razorpay\|zomato" backend/ --include=*.py \| grep -v tests` returns nothing; demo names appear only in `scripts/demo_companies.json`. `POST /api/companies` returned 201 built purely from request data. |
| AC2 | MeetUniversity profile cites page URLs and lists unverified items | **UNVERIFIED** | blocked | Kept UNVERIFIED on this branch until a clean, full real-run output after hardening is committed. Unfetched-evidence demotion and URL citation checks are proven offline in `tests/test_research.py` and `tests/test_e2e_pipeline.py`. |
| AC3 | Interview questions differ across the three companies | **UNVERIFIED** | blocked | No committed live run captures non-skipped interview questions across all 3 companies (`--skip-interview` was used in historical `run_output.txt`). Profile-driven generation and dedupe are covered offline by `tests/test_interview.py` and `tests/test_e2e_pipeline.py`. |
| AC4 | Interview answers persist across a server restart | **PASS** | code level | `tests/test_interview.py::test_answers_survive_a_new_session_and_engine` reads answers back through a brand-new session. Answers are committed rows in `qa`; no in-process state exists. A live restart mid-interview still needs a networked run. |
| AC5 | Every stored source passed a real fetch; true count per category | **UNVERIFIED** | blocked | Kept UNVERIFIED on this branch until a clean, full real-run output after hardening is committed. Real-fetch verification and unverified candidate rejection are covered offline in `tests/test_api_phase4_8.py` and `tests/test_e2e_pipeline.py`. |
| AC6 | Records keep original URL, discovery timestamp, content hash; second crawl creates no duplicates | **PASS** | code level | `tests/test_pipeline_phase5.py` and `tests/test_e2e_pipeline.py` (local HTTP server) verify URL, `discovered` timestamp, 64-char SHA-256 `content_hash`, and `new_records == 0` on second crawl. |
| AC7 | SSRF tests pass for 127.0.0.1, 10.x, 169.254.169.254 and a redirect to a private IP | **PASS** | verified | `pytest tests/test_safe_fetch.py` → 36 passed. Covers literal private/metadata addresses, non-http schemes, credentials-in-URL, and `test_redirect_to_private_ip_is_blocked`, which asserts the private hop is never requested. |
| AC8 | Every report claim cites record ids that exist | **PASS** | code level | `tests/test_brief.py` and `tests/test_e2e_pipeline.py` verify invalid citation IDs are stripped, empty sections fall back to the exact PRD sentence, and actions without valid evidence are dropped. |
| AC9 | Ranking explanation visible per record | **PASS** | code level | `ranking.score_record` stores six components, weights, total and an explanation; `GET /api/companies/{id}/intelligence` and `GET /api/signals/{id}` return `explanation` (asserted in `tests/test_e2e_pipeline.py` and `tests/test_api_phase4_8.py`). |
| AC10 | Weekly job and audit run and write `job_logs`, visible in UI | **PASS** | code level / offline proof | `scripts/prove_scheduler.py` proves APScheduler executes a scheduled job and writes `job_logs`; `tests/test_scheduler_proof.py` verifies Monday 07:00 `Asia/Kolkata` and seeded monthly audit. `POST /api/companies/{id}/source-audit` and `/automation/run` write `job_logs`. |
| AC11 | Context reassessment changes relevance for MeetUniversity, with reasons | **UNVERIFIED** | blocked | No committed live run output includes `--reassess` for MeetUniversity. Threshold, reasons, invented-id rejection and the no-delete guarantee are covered offline by `tests/test_api_phase4_8.py`, `tests/test_gap_closure_p1.py`, and `tests/test_e2e_pipeline.py`. |
| AC12 | README reproduces setup from scratch; limitations listed | **PASS** | verified | `README.md`, `scripts/start_local.ps1`, `scripts/net_diag.py`, and `docs/COST_AND_LIMITATIONS.md` document setup, diagnostics, and non-PRD/unverified items honestly. |

Summary: **8 PASS** (AC1, AC4, AC6, AC7, AC8, AC9, AC10, AC12 — verified locally or at code/offline-E2E level) and **4 UNVERIFIED** (AC2, AC3, AC5, AC11 — awaiting a committed full real-run output from a machine with internet + `GROQ_API_KEY`).

## What "code level" PASS does and does not mean

It means the logic required by the criterion executed under test and the assertion held: citation stripping really
strips, the second crawl really returns zero new records, snippets really are compared verbatim. It does **not**
mean a real company was processed. Do not present any of these as a live result, and do not upgrade them to
"verified" without a networked run.

## Session verification log

| Check | Result |
|---|---|
| `pytest` (backend) | **149 passed** |
| `npx tsc --noEmit` (frontend) | **clean**, 0 errors |
| `npm run lint` (frontend) | **clean**, 0 warnings/errors |
| `npm run build` (frontend) | **9 routes** built (`proxyTimeout: 300000`) |
| UI routes over HTTP | `/` returns 200 through Next; `/api/health` returns 200 both direct and through the Next proxy |
| `/api/health` | `{"status":"ok","dialect":"sqlite","tables":[6 names]}` |
| Workflows | `tests.yml` (3.11 + 3.12 matrix, frontend typecheck/build) and `weekly.yml` (weekly brief, monthly audit) parse as valid YAML; neither has run on GitHub |
| Python 3.11 | **verified locally** (149 tests) |
| Python 3.12 | **NOT RUN** — not installable in the sandbox; CI matrix configured, first run pending |
| Committed live log (`run_output.txt`) | MeetUniversity (5 verified sources, 5 records, Brief #1 with 3 actions), Razorpay (16 verified sources, 23 records crawled), Zerodha (research 6 pages) |

## Closing the four open rows

```bash
cp .env.example .env                 # set GROQ_API_KEY; confirm GROQ_MODEL is on the free-tier list
cd backend && ../.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
# in another terminal: cd frontend && npm run dev
cd .. && .venv/bin/python scripts/preflight.py     # must print [PASS] for all 7 checks
python scripts/run_three_companies.py --yes 2>&1 | tee run_output.txt
python scripts/run_three_companies.py --only meetuniversity --skip-interview --yes \
  --reassess meetuniversity --context "International student recruitment and overseas education consultancy"
```

Then paste/commit the real numbers into this file, the `README.md` table, and `docs/COST_AND_LIMITATIONS.md` from `run_output.txt` only.
