# Acceptance criteria — status and evidence

Legend:
- **PASS** — executed in this build session, output observed.
- **PASS (test)** — the logic is covered by a test that ran and passed; the end-to-end real-data demonstration
  still needs a machine with internet + `GROQ_API_KEY`.
- **NOT VERIFIED** — cannot be claimed. Reason and the exact command to verify are given.

Environment facts that drive the “NOT VERIFIED” rows: this sandbox blocks egress to company websites and
`api.groq.com`, and no Groq key was available. I did not fake a run to turn these green.

| # | Criterion | Status | Evidence / how to verify |
|---|---|---|---|
| AC1 | Creating a company never uses hardcoded competitors or sources | **PASS** | `grep -rlEi "meetuniversity\|razorpay\|zomato" backend/ --include=*.py` (excluding tests) → no matches. Demo companies exist only in `scripts/demo_companies.json`, consumed by a demo driver. |
| AC2 | MeetUniversity profile cites page URLs and lists unverified items | **NOT VERIFIED** | Requires a real crawl + Groq call. Logic verified: `tests/test_research.py` (facts with an unfetched `evidence_url` are demoted to `unverified`; API test asserts `pages_fetched` and `unverified_count`). Verify: `python scripts/run_three_companies.py --only meetuniversity --skip-interview --yes`, then `GET /api/companies/1/profile`. |
| AC3 | Interview questions differ across the three companies | **NOT VERIFIED** | Generation is profile-driven (`interview._generate_questions` uses summary, industry, competitors, context) and deduped by Jaccard similarity; covered in `tests/test_interview.py`. The three real question lists require the live run. |
| AC4 | Interview answers persist across a server restart | **PASS (test)** | `tests/test_interview.py::test_answers_survive_a_new_session_and_engine` reads answers back through a fresh session; answers are rows in `qa`, committed per answer, no in-memory state. A live restart demo during the real run completes this. |
| AC5 | Every stored source passed a real fetch; true count per category | **PASS (test) / NOT VERIFIED (counts)** | `discovery.discover` stores a candidate only after `safe_fetch.fetch` succeeds; drops are returned with reasons (`tests/test_api_phase4_8.py::test_discovery_drops_unverified_candidates`). Real counts come from the live run — do not fill them in from memory. |
| AC6 | Crawl records carry original URL, discovery timestamp, content hash; second crawl creates no duplicates | **PASS (test)** | `tests/test_pipeline_phase5.py::test_crawl_creates_record_with_url_time_and_hash` and `::test_second_crawl_creates_no_duplicates` (second run: `new_records == 0`, `duplicates == 1`, count stays 1). |
| AC7 | SSRF tests pass for 127.0.0.1, 10.x, 169.254.169.254 and a redirect to a private IP | **PASS** | `backend/tests/test_safe_fetch.py` — 36 tests, including literal private/metadata addresses, non-http schemes, credentials-in-URL, and `test_redirect_to_private_ip_is_blocked` which asserts the private hop is **never requested**. Side effect: the live demo of "no outbound internet" itself returned `blocked: DNS resolution failed` for the company site. |
| AC8 | Every report claim cites record ids that exist | **PASS (test)** | `tests/test_brief.py::test_invalid_citation_ids_are_stripped`, `::test_section_with_only_invalid_citations_falls_back_to_empty_sentence`; API test asserts the persisted brief's citation set equals the real analysed record set. `brief.generate` also re-checks every cited id against the DB before committing. |
| AC9 | Ranking explanation visible per record | **PASS** | `ranking.score_record` stores components + explanation; `GET /api/signals/{id}` exposes `explanation` (asserted in `test_intelligence_and_signal_detail_expose_explanation`); the Intelligence page renders it with the component chart. |
| AC10 | Weekly job and audit run and write `job_logs`, visible in UI | **NOT VERIFIED (schedule) / PASS (plumbing)** | `.github/workflows/weekly.yml` is valid YAML with weekly + monthly cron and manual trigger; `run_weekly.py` / `run_audit.py` write `job_logs`; crawl/analyse/brief already write job_logs rows (asserted in tests); the Automation page lists them. The scheduled Actions run needs a repo with secrets. |
| AC11 | Context reassessment changes relevance for MeetUniversity, with reasons | **PASS (test) / NOT VERIFIED (real numbers)** | `tests/test_api_phase4_8.py::test_context_reassess_flags_low_relevance_without_deleting` asserts rescoring, reasons, the <0.4 recommendation list, that invented source ids are ignored, and that nothing is deleted. Real before/after values need the live run with `--reassess`. |
| AC12 | README reproduces setup from scratch; limitations listed | **PASS** | README quick start was the sequence actually used here (venv → pip → uvicorn → `/docs` 200 → npm install → `npm run dev` → all six routes 200). `docs/limitations.md` lists 20 concrete limitations. |

## Verified counts in this session (non-intelligence, dev-only)

These are *test* artefacts, not company intelligence — they exist to prove plumbing and are labelled `TEST_`:

- Backend tests: **117 passed** (safe_fetch 36, research, interview, pipeline, brief, API phases 2–3 and 4–8).
- Frontend: `npx tsc --noEmit` clean; `/`, `/company/1` and its five sub-routes returned HTTP 200 with the API
  proxy returning live `{"status":"ok"}`.
- Tables created: `companies, job_logs, qa, records, reports, sources`.

## What must be run to close the open rows

```bash
cp .env.example .env      # set GROQ_API_KEY
cd backend && ../.venv/bin/uvicorn main:app --port 8000
../.venv/bin/python scripts/run_three_companies.py --yes
../.venv/bin/python scripts/run_three_companies.py --only meetuniversity --skip-interview --yes \
  --reassess meetuniversity --context "International student recruitment and overseas education consultancy"
```

Then replace the counts table in the README with the numbers the run prints, and flip AC2, AC3, AC5, AC10
(schedule), AC11 in this file only where the output actually supports it.
