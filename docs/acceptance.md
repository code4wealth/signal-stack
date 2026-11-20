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
| AC2 | MeetUniversity profile cites page URLs and lists unverified items | **FAIL / UNVERIFIED** | blocked | Real call returned 502 (transport error above), so no profile exists. Demotion of facts with unfetched evidence is covered by `tests/test_research.py`, but that is not the criterion. Settle with: `python scripts/run_three_companies.py --only meetuniversity --skip-interview --yes`, then `GET /api/companies/{id}/profile`. |
| AC3 | Interview questions differ across the three companies | **FAIL / UNVERIFIED** | blocked | Generation requires a stored profile; without one the API correctly returns `400 "Run company research before starting the interview."`. Profile-driven generation and dedupe are covered by `tests/test_interview.py`. Settle with the full driver run: it now dumps every question per company into `exports/demo_<company>.json`. |
| AC4 | Interview answers persist across a server restart | **PASS** | code level | `tests/test_interview.py::test_answers_survive_a_new_session_and_engine` reads answers back through a brand-new session. Answers are committed rows in `qa`; no in-process state exists. A live restart mid-interview still needs the real run. |
| AC5 | Every stored source passed a real fetch; true count per category | **FAIL / UNVERIFIED** | blocked | No candidate can be fetched, so nothing is stored — discovery refuses to run without a profile (`400`) and drops unreachable candidates by design (`tests/test_api_phase4_8.py::test_discovery_drops_unverified_candidates`). Counts: `GET /api/companies/{id}/sources` after the live run. |
| AC6 | Records keep original URL, discovery timestamp, content hash; second crawl creates no duplicates | **PASS** | code level | `tests/test_pipeline_phase5.py::test_crawl_creates_record_with_url_time_and_hash`, `::test_second_crawl_creates_no_duplicates` (second run: `new_records == 0`, `duplicates == 1`, table count stays 1), `::test_changed_page_at_same_url_is_stored_as_updated`. |
| AC7 | SSRF tests pass for 127.0.0.1, 10.x, 169.254.169.254 and a redirect to a private IP | **PASS** | verified | `pytest tests/test_safe_fetch.py` → 36 passed. Covers literal private/metadata addresses, non-http schemes, credentials-in-URL, and `test_redirect_to_private_ip_is_blocked`, which asserts the private hop is never requested. Ran with no network, so it proves the guard rather than the upstream site. |
| AC8 | Every report claim cites record ids that exist | **PASS** | code level | `tests/test_brief.py::test_invalid_citation_ids_are_stripped`, `::test_section_with_only_invalid_citations_falls_back_to_empty_sentence`, `::test_actions_without_valid_evidence_are_dropped`; API test asserts the persisted citation set equals the analysed record set. `brief.generate` re-checks each id against the DB before commit. |
| AC9 | Ranking explanation visible per record | **PASS** | code level | `ranking.score_record` stores six components, weights, total and an explanation; `GET /api/signals/{id}` returns `explanation` (asserted in `test_intelligence_and_signal_detail_expose_explanation`); the Intelligence page renders it with a component chart. |
| AC10 | Weekly job and audit run and write `job_logs`, visible in UI | **PASS** | verified (manual trigger) | `POST /api/companies/1/automation/run` and `POST /api/companies/1/source-audit` executed and wrote four rows — `crawl: skipped`, `analyse: ok`, `weekly: partial`, `source_audit: ok` — returned by `GET /api/companies/1/job-logs` and rendered on the Automation page. The GitHub Actions schedule itself is unobserved (needs repo secrets); the workflow is committed and valid YAML. |
| AC11 | Context reassessment changes relevance for MeetUniversity, with reasons | **FAIL / UNVERIFIED** | blocked | Needs real sources to re-score. Threshold, reasons, invented-id rejection and the no-delete guarantee are covered by `tests/test_api_phase4_8.py::test_context_reassess_flags_low_relevance_without_deleting`. Settle with `--reassess meetuniversity --context "International student recruitment and overseas education consultancy"`. |
| AC12 | README reproduces setup from scratch; limitations listed | **PASS** | verified | README quick start is the sequence executed here (venv → pip → uvicorn → `/docs` 200 → npm install → `npm run dev` → six routes 200). `docs/COST_AND_LIMITATIONS.md` lists the sandbox constraint plus 20 limitations. |

Summary: **8 PASS** (AC1, AC4, AC6, AC7, AC8, AC9, AC10, AC12 — three of them verified by execution, five at code
level) and **4 FAIL/UNVERIFIED** (AC2, AC3, AC5, AC11).

## What "code level" PASS does and does not mean

It means the logic required by the criterion executed under test and the assertion held: citation stripping really
strips, the second crawl really returns zero new records, snippets really are compared verbatim. It does **not**
mean a real company was processed. Do not present any of these as a live result, and do not upgrade them to
"verified" without a networked run.

## Session verification log

| Check | Result |
|---|---|
| `pytest` (backend) | **117 passed** in ~6 s |
| `npx tsc --noEmit` (frontend) | **clean**, 0 errors |
| `npm run build` (frontend) | 8 routes built |
| UI routes over HTTP | `/` and all five company tabs return 200 through the Next proxy |
| `/api/health` | `{"status":"ok","dialect":"sqlite","tables":[6 names]}` |
| API surface | 30 paths in `/openapi.json` |
| Workflows | `tests.yml` (3.11 + 3.12 matrix, frontend typecheck/build) and `weekly.yml` (weekly brief, monthly audit) parse as valid YAML; neither has run on GitHub |
| Python 3.11 | **verified locally** (117 tests) |
| Python 3.12 | **NOT RUN** — not installable in the sandbox; CI matrix configured, first run pending |
| Database after this session | wiped to 0 rows in all six tables, so the operator's run starts clean |

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
