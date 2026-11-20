# Acceptance criteria — status and evidence

Checked **2026-11-20**. Legend: **PASS** = executed here, output observed. **FAIL** = not demonstrable in this
environment; the reason and the exact command to verify are given. Nothing is marked PASS on the strength of code
that was never run.

## Environment facts behind every FAIL

```
$ curl -s -o /dev/null -w "%{http_code}" https://www.meetuniversity.com   -> 000
$ curl -s -o /dev/null -w "%{http_code}" https://api.groq.com/openai/v1/models -> 000
$ [ -f .env ]                                                             -> absent
$ echo $GROQ_API_KEY                                                      -> unset

$ curl -X POST localhost:8000/api/companies/1/research
502 {"detail":"Could not fetch any page from https://www.meetuniversity.com:
     homepage: fetch: transport error: ConnectError: TLS/SSL connection has been closed (EOF)"}
$ curl -s localhost:8000/api/llm/healthcheck
503 {"detail":"GROQ_API_KEY is not set. Add it to .env (see .env.example) and restart the server."}
```

| # | Criterion | Status | Evidence |
|---|---|---|---|
| AC1 | Creating a company never uses hardcoded competitors or sources | **PASS** | `grep -rlEi "meetuniversity\|razorpay\|zomato" backend/ --include=*.py \| grep -v tests` → no matches. Demo names exist only in `scripts/demo_companies.json`. `POST /api/companies` returned 201 with name/website/context straight from the request. |
| AC2 | MeetUniversity profile cites page URLs and lists unverified items | **FAIL** | Blocked: the real research call returned 502 (transport error above), so no profile exists. Logic verified by `tests/test_research.py` (facts citing an unfetched URL are demoted to `unverified`) and the API test asserting `pages_fetched` + `unverified_count`. Verify with a key + internet: `python scripts/run_three_companies.py --only meetuniversity --skip-interview --yes`, then `GET /api/companies/{id}/profile`. |
| AC3 | Interview questions differ across the three companies | **FAIL** | Blocked: no profile means generation cannot run (observed `400 "Run company research before starting the interview."`). Generation is profile-driven and deduplicated (`tests/test_interview.py`), but the three real lists require the live run. |
| AC4 | Interview answers persist across a server restart | **PASS (test-level)** | `tests/test_interview.py::test_answers_survive_a_new_session_and_engine` reads answers back through a brand-new session; answers are committed rows in `qa`, no in-process state. A live restart mid-interview still needs the real run. |
| AC5 | Every stored source passed a real fetch; report true count per category | **FAIL** | Blocked: discovery cannot reach any candidate, and it refuses to run without a profile (`400`). Store-only-after-fetch is enforced in `discovery.discover` and covered by `test_discovery_drops_unverified_candidates`. Real counts: `GET /api/companies/{id}/sources` after the live run. |
| AC6 | Records keep original URL, discovery timestamp, content hash; second crawl creates no duplicates | **PASS (test-level)** | `tests/test_pipeline_phase5.py::test_crawl_creates_record_with_url_time_and_hash`, `::test_second_crawl_creates_no_duplicates` (second run: `new_records == 0`, `duplicates == 1`, table count stays 1), `::test_changed_page_at_same_url_is_stored_as_updated`. |
| AC7 | SSRF tests pass for 127.0.0.1, 10.x, 169.254.169.254 and a redirect to a private IP | **PASS** | `pytest tests/test_safe_fetch.py` → 36 passed. Includes literal private/metadata addresses, non-http schemes, credentials-in-URL, and `test_redirect_to_private_ip_is_blocked`, which asserts the private hop is never requested (`assert not private_route.called`). |
| AC8 | Every report claim cites record ids that exist | **PASS (test-level)** | `tests/test_brief.py::test_invalid_citation_ids_are_stripped`, `::test_section_with_only_invalid_citations_falls_back_to_empty_sentence`, `::test_actions_without_valid_evidence_are_dropped`; the API test asserts the persisted citation set equals the real record set. `brief.generate` re-checks every id against the DB before committing. |
| AC9 | Ranking explanation visible per record | **PASS** | `ranking.score_record` stores six components + weights + explanation; `GET /api/signals/{id}` returns `explanation` (asserted in `test_intelligence_and_signal_detail_expose_explanation`); the Intelligence page renders it with the component chart. |
| AC10 | Weekly job and audit run and write `job_logs`, visible in UI | **PASS (manual trigger; cron unobserved)** | `POST /api/companies/1/automation/run` and `POST .../source-audit` ran for real and produced four log rows: `crawl: skipped`, `analyse: ok`, `weekly: partial`, `source_audit: ok`; `GET /api/companies/1/job-logs` returns them and the Automation page renders them. The GitHub Actions schedule itself was not executed — it needs a repo with secrets. |
| AC11 | Context reassessment changes relevance for MeetUniversity, with reasons | **FAIL** | Blocked: needs real sources to re-score. Threshold, reasons, invented-id rejection and the no-delete guarantee are covered by `test_context_reassess_flags_low_relevance_without_deleting`. Real before/after numbers need `--reassess` on the live run. |
| AC12 | README reproduces setup from scratch; limitations listed | **PASS** | The README quick start is the exact sequence executed here (repo-root venv → pip → uvicorn → `/docs` 200 → npm install → `npm run dev` → all six routes 200). `docs/COST_AND_LIMITATIONS.md` lists 20 limitations. |

## Verified state in this session

| Check | Result |
|---|---|
| `pytest` (backend) | **117 passed** in ~7 s |
| `npx tsc --noEmit` (frontend) | **clean**, 0 errors |
| `npm run build` (frontend) | 8 routes built |
| UI routes over HTTP | `/` and all five company tabs return 200 through the Next proxy |
| `/api/health` | `{"status":"ok","dialect":"sqlite","tables":[6 names]}` |
| API surface | 30 paths in `/openapi.json` |
| Database before the live run | 0 companies, 0 sources, 0 records, 0 reports, 0 qa, 0 job_logs |
| Upload of `demo_data/DEMO_synthetic_support_tickets.csv` | 201, 1692 chars, label `user-provided` |
| Python 3.11 (local) | **verified** — 117 tests pass |
| Python 3.12 (PRD target) | **not run yet** — not installable in the build sandbox; matrix added in `.github/workflows/tests.yml` on 2026-11-20, first CI run pending |
| CI workflows | `tests.yml` (3.11 + 3.12 matrix, frontend typecheck/build) and `weekly.yml` (weekly brief + monthly audit) both parse as valid YAML; neither has been executed on GitHub |

## Why this is not "complete"

AC2, AC3, AC5 and AC11 are **P0/P1 criteria that fail here**. The product is not finished until they pass on a
machine with internet access and a Groq key; this file and the README must then be updated from that run's actual
output. Nothing in this repository currently claims otherwise.

```bash
cp .env.example .env                 # set GROQ_API_KEY
cd backend && ../.venv/bin/uvicorn main:app --port 8000
../.venv/bin/python scripts/run_three_companies.py --yes
../.venv/bin/python scripts/run_three_companies.py --only meetuniversity --skip-interview --yes \
  --reassess meetuniversity --context "International student recruitment and overseas education consultancy"
```
