# Architecture

## Shape

```
frontend/ (Next.js 15, App Router, TypeScript strict)
    │  relative /api/* calls only  (server-side rewrite -> BACKEND_URL)
    ▼
backend/main.py (FastAPI)  ── routes.py (30 paths, Pydantic I/O)
    │
    ├── research.py    homepage + ≤5 internal pages → Profile (facts need evidence URLs)
    ├── interview.py   qa table: 10 questions, vague-only follow-ups, resume, complete
    ├── discovery.py   LLM candidates → safe_fetch verification → sources(status=pending)
    ├── crawler.py     approved sources → records (no LLM), feed + page, hash dedup
    ├── analysis.py    record → Analysis, verbatim evidence check, ranking
    ├── ranking.py     deterministic weights, components + explanation
    ├── brief.py       11 sections, citation validation, markdown
    ├── context.py     relevance re-scoring, removal recommendations only
    ├── documents.py   TXT/CSV upload → internal source + record (user-provided)
    ├── audit.py       source health audit, weekly job
    └── scheduler.py   APScheduler (opt-in) for local automation
```

Two modules own the outside world:

- `safe_fetch.py` — **all** outbound HTTP. Scheme allow-list, DNS resolution + private/loopback/link-local/
  reserved/metadata blocking, per-hop redirect re-validation, robots.txt (cached, 5xx ⇒ disallow), 1 req/s per
  host, 15 s timeout, 3 MB cap, retries with exponential backoff, ETag/If-Modified-Since support.
- `llm.py` — **all** Groq traffic. Every response validated against a Pydantic model, retried, then raised as
  `LLMError` (HTTP 503). Crawled text is only ever passed inside `<untrusted_source>` tags in the *user*
  message; the system prompt never contains crawled content.

## Data model (6 tables)

`companies` → `qa`, `sources`, `records`, `reports`, `job_logs`; all children use
`ON DELETE CASCADE` (SQLite `PRAGMA foreign_keys=ON` is set on connect), indexes on `company_id`,
`records.content_hash` and `records.total`.

JSON columns (`companies.profile`, `records.analysis`, `records.scores`, `reports.content`) are a time-budget
decision, documented in `docs/limitations.md`. The engine is created from `DATABASE_URL`, so Postgres is a
configuration change rather than a rewrite; `JSON` maps to `jsonb`-compatible `JSON` on both.

## Ranking

```
score = 100 × (0.25·relevance + 0.25·impact + 0.15·urgency
             + 0.15·credibility + 0.10·recency + 0.10·novelty)
```
- relevance / impact / urgency: stored LLM estimates (clamped 0–1)
- credibility: the source's stored `reliability`
- recency: `max(0, 1 − age_days/30)`, using published date else discovery date
- novelty: `1.0` new record, `0.3` update of an existing URL

`records.scores` stores all six components, the weights, the total and a sentence-long explanation naming each
contribution. The UI renders the explanation and a bar chart of the same stored numbers — nothing is recomputed
in the browser.

## Evidence chain

1. Source stored only after a successful real fetch (`discovery.verify_candidate`).
2. Crawl stores URL, discovery timestamp, SHA-256 of whitespace-normalised text, and the text itself.
3. Analysis asks for an `evidence_snippet`; `analysis.snippet_is_verbatim` requires it to appear in the text
   after whitespace normalisation. Failure ⇒ `evidence_strength ≤ 0.2` and `flag` set.
4. Brief prose may cite only record ids passed to the model; ids outside the set are stripped, and sections left
   with no valid citation fall back to the exact sentence
   "No meaningful verified development was identified during this monitoring period."

## Failure behaviour

- `safe_fetch` raises typed errors (`blocked`, `robots`, `fetch`). Crawl records them on the source
  (`health=error`, `last_error`) and moves on; one dead source never aborts a run.
- Analysis failures are counted and logged; the run continues and `job_logs.status` becomes `partial`.
- LLM unavailability returns HTTP 503 with a JSON `detail`, so the UI shows a real error instead of a spinner.
- Every pipeline stage writes a `job_logs` row (crawl, analyse, brief, weekly, source_audit, context_reassess).

## Concurrency and limits

Crawl uses a `ThreadPoolExecutor` capped at 4 workers; fetching happens in threads and all writes happen on the
request thread (SQLite is single-writer). Analyses are capped at `MAX_ANALYSES_PER_RUN` (default 40) with a
one-second pause between Groq calls and per-call retries.
