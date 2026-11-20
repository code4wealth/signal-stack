# Limitations — what this build does not do

Written to be read before the demo, not after. Nothing here is a bug that was hidden; it is either a deliberate
scope cut (PRD §3, §4) or a known weakness of the approach.

## Environment limits of this build session (important)

1. **The real-data run has not happened yet.** The build sandbox could not reach company websites or
   `api.groq.com` (egress restricted to GitHub/npm/PyPI) and had no `GROQ_API_KEY`. Therefore AC2–AC6, AC10,
   AC11 and the count targets are marked **NOT VERIFIED** in `docs/acceptance.md` with the exact command to
   verify them. The code paths are covered by tests with mocked HTTP and a mocked LLM.
2. **Python 3.11.2, not 3.12.** 3.12 could not be installed (no apt, no downloadable CPython). The entire
   declared stack runs unchanged on 3.11; `requirements.txt` does not pin the minor version.

## Deliberate scope cuts

3. **No JavaScript rendering.** JS-heavy sites (SPA shells, infinite scroll) yield little readable text.
   `research` records such a site as "too little readable text" instead of guessing, and `discovery` drops
   candidates whose fetch returns nothing useful.
4. **No PDF export, no Alembic migrations, no 18-table normalised schema.** Six tables plus JSON columns were
   the time-budget choice. Migration story: delete the SQLite file (or point `DATABASE_URL` at Postgres) and let
   `create_all` build the schema.
5. **No auth, billing or multi-tenancy.** One deployment = one operator. Every endpoint is open.
6. **Recharts is used for one small component chart.** No dashboard-level analytics.
7. **No action-state table.** Action checkboxes persist inside `reports.content` JSON (PRD fixes the schema at
   six tables). Editing an action's text is not supported; only `done` is.

## Security gaps (documented, not fixed)

8. **DNS rebinding** between the resolution check and the TCP connect is not defended against. The window is
   narrowed by re-resolving and re-checking every redirect hop, but a determined attacker controlling DNS could
   still land a connection on an internal address. A full fix needs socket-level connection pinning (connect to
   the validated IP, send the original `Host` header), which was out of the time budget.
9. **No proxy support and no egress allow-list.** `trust_env=False` is set so ambient proxies cannot redirect
   traffic; that also means corporate proxies are ignored.
10. **Robots.txt is advisory-by-cache.** Parsed once per origin with a one-hour TTL; a mid-run change is missed.
    Unreachable `robots.txt` is treated as "allow" (RFC 9309 allows this); 5xx is treated as "disallow all".
11. **No rate limiting on the API itself.** Outbound crawling is rate limited per host; inbound API calls are not.
12. **Upload validation is extension + decodability + NUL-byte + size.** A malicious but well-formed `.txt` file
    is accepted; content is treated as untrusted everywhere it is used.

## Quality gaps

13. **Groq free-tier rate limits** shape throughput: 40 analyses per run, one-second pauses, three attempts with
    backoff. A large crawl will need multiple analysis runs; the UI exposes "Analyse new records" for that.
14. **The GitHub Actions workflow has no persistent database.** Runners are ephemeral, so each scheduled run
    starts from an empty SQLite unless `DATABASE_URL` points at real Postgres (Supabase free tier works) and is
    added as a repository secret. The workflow uploads the DB and job output as artifacts either way.
15. **APScheduler runs only in-process.** It dies when the host sleeps or the process restarts; the cron file is
    the reliable path. `ENABLE_SCHEDULER=0` by default so `--reload` does not double-schedule.
16. **Follow-up detection is heuristic-first.** `is_vague()` (length, vague markers) gates the LLM call, so a
    long but empty answer will not trigger a follow-up. Deliberate: it keeps follow-ups rare and cheap, and it is
    testable.
17. **One LLM call per context reassessment batch**, not per source. Cheaper and more consistent, but a single
    malformed response means fewer sources get re-scored; the response's invented ids are ignored and reported.
18. **Analysis quality depends on page readability.** Directory-style pages, pagination and cookie walls produce
    thin text and therefore low-value signals; they are not filtered out beyond the 250-character minimum.
19. **No de-duplication of near-identical text** (syndicated articles): dedup is exact hash equality after
    whitespace normalisation, plus URL equality.
20. **Interview questions are generated once per company.** Re-running `start` resumes the same set; there is no
    "regenerate questions" button, to avoid losing answers.

## What would be next with more time

Connection pinning for SSRF, Postgres + Alembic, a `report_actions` table, per-article extraction quality
scoring, retry/backoff telemetry in the UI, and a second LLM pass that cross-checks each brief sentence against
its cited record (currently only the citation ids are validated, not sentence-level entailment).
