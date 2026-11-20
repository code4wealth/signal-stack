# Cost and Limitations

## Free tools used

FastAPI, SQLAlchemy, SQLite, httpx, BeautifulSoup, trafilatura, feedparser, pandas, APScheduler, pytest, respx
(open source). Next.js, React, Tailwind, Lucide, Recharts. Groq API on its free tier. GitHub Actions on its free tier.
No paid service, API, proxy or scraper is used anywhere. Hosting: **none — everything ran locally.**

## Free-tier limits

Checked **2026-11-20** from published 2026 documentation and reporting; values change, re-check before submitting.

**Groq free tier.** Rate limits are enforced per organisation (multiple keys share one pool) and per model class:

| Model class | Requests/min | Requests/day | Tokens/min | Tokens/day |
|---|---|---|---|---|
| Entry-level text models (e.g. Llama 3.1 8B Instant) | 30 | 14,400 | 6,000 | 500,000 |
| Larger models (e.g. 70B class) | 30 | 1,000 | 8,000 | 200,000 |

The per-minute window is rolling; the daily quota resets at midnight UTC. 429s are returned immediately with no
queueing. Sources: [klymentiev.com](https://klymentiev.com/blog/groq-api-free-tier) (Oct 2026),
[theneuralbase.com](https://theneuralbase.com/groq/learn/beginner/free-tier-limits/) (Apr 2026),
[iadecider.com](https://iadecider.com/articles/free-ai-api-tiers-index-2026) (Oct 2026).

⚠️ The same reporting conflicts on whether `llama-3.3-70b-versatile` is still free-tier; one October 2026 source
states that Llama 3.3 moved to Enterprise and that the free chat models are now `openai/gpt-oss-120b`,
`openai/gpt-oss-20b` and a Qwen model. **I could not verify this**: `console.groq.com` is unreachable from the build
environment and no key was available. If the first call returns a model error, change `GROQ_MODEL`.

What this build does about it: `MAX_ANALYSES_PER_RUN=40`, a one-second pause between analysis calls, three attempts
with exponential backoff per call, and per-record failure isolation (one failed record does not abort the run). I do
not assume unlimited access, and a large crawl is expected to need several "Analyse new records" runs.

**GitHub Actions free tier.**

| Plan | Public repos | Private repos | Artifact storage |
|---|---|---|---|
| Free | standard runners free and unmetered | 2,000 Linux minutes/month | 500 MB |

Larger runners and GPU runners are billed even on public repos. Sources:
[cicdcalculator.com](https://cicdcalculator.com/github-actions-free-tier) (13 Nov 2026),
[latchkey.dev](https://latchkey.dev/learn/cost/is-github-actions-free) (Sep 2026),
[craci.com](https://craci.com/compare/github-actions-runner-providers) (11 Nov 2026).

**Not verified:** any hosting provider's free tier, because nothing was deployed.

## Sandbox network constraint (architectural limitation)

The environment this repository was built and verified in has **no outbound network access** except to the package
registries needed to install dependencies. Measured on 2026-11-20:

```
curl https://api.groq.com/openai/v1/models        -> HTTP 000 (no connection)
curl https://www.meetuniversity.com               -> HTTP 000
curl https://razorpay.com                         -> HTTP 000
curl https://www.zomato.com                       -> HTTP 000
curl http://localhost:8000/api/llm/healthcheck    -> 503 {"detail":"GROQ_API_KEY is not set. ..."}
POST /api/companies/1/research                     -> 502 {"detail":"... ConnectError: TLS/SSL connection
                                                      has been closed (EOF)"}
```

Consequences, stated plainly:

1. **No live pipeline run exists.** Research, discovery, crawl, analysis, ranking and brief generation have never
   executed against a real company in this environment. Everything below the HTTP/LLM boundary is covered by unit
   and API tests with mocked responses, not by observed production output.
2. **Every count is unmeasured.** The README results table and "Targets vs actual" below say
   "Not measured" because filling them would require inventing data.
3. **The failure is loud, not silent.** The application returns typed errors (502 for a fetch failure, 503 for a
   missing LLM), the CLI driver exits non-zero, and no partial or placeholder record is written.
4. **A key alone does not lift the block.** With `GROQ_API_KEY` set, `/api/health` reports
   `api_key_configured: true` and `/api/llm/healthcheck` moves from "key is not set" to
   `Groq request failed after 2 attempts: APIConnectionError` — the credential is read correctly and the socket is
   still refused. Both egress **and** a key are required; this environment has the second and not the first.
5. This is an *environment* limitation, not a product limitation: the same code runs unmodified on a host with
   internet and a key. The one design interaction worth knowing is that `safe_fetch`'s allow-list is deliberately
   strict, so a misconfigured host fails closed rather than reaching something it should not.

To close it: `scripts/run_three_companies.py --yes` on a networked machine, then replace the two counts tables with
that output.

## Known shortcomings

1. **No live run has completed.** The build environment blocked egress to company sites and `api.groq.com` and had
   no Groq key, so no real source, record or brief exists yet. Every count in the README is marked "Not measured —
   sandbox egress blocked". See the section above for the measured evidence.
2. **SQLite with JSON columns** instead of the full normalised schema. Reason: time budget. `DATABASE_URL` makes
   Postgres a configuration change.
3. **No Alembic migrations.** Schema is created with `create_all`.
4. **JavaScript-rendered sites are not rendered**, so SPA pages yield little text. Such a site is reported as
   "too little readable text" rather than guessed at.
5. **DNS-rebinding gap** in SSRF protection: the address is validated, then the connection is made by hostname, so a
   hostile DNS answer between the two steps could still reach an internal address. Mitigated per redirect hop, not
   eliminated. The fix is connection pinning, which was out of scope.
6. **Source reliability ratings are initial estimates** from the discovery prompt (0.9 official, 0.7 trade press,
   0.6 company site, 0.4 blog), not measured accuracy.
7. **LLM relevance, impact and urgency are estimates.** Evidence is checked only by verbatim snippet match; there is
   no entailment check that the snippet actually supports the claim.
8. **PDF and XLSX uploads, PDF export: not implemented.** Only TXT and CSV upload; only Markdown export.
9. **Scheduled runs have no persistent database.** Ephemeral runners mean an empty SQLite each time unless
   `DATABASE_URL` points at Postgres with a repository secret. The cron workflow is committed and valid, but I could
   not observe a scheduled execution.
10. **The scheduled workflow, audit and weekly job are verified only as code paths.** Running them through the API
    produced real `job_logs` rows; the Actions run requires a repository with secrets.
11. **Interview follow-up detection is heuristic-first**: `is_vague()` (length + vague markers) gates the LLM call, so
    a long but empty answer will not trigger a follow-up.
12. **Context reassessment is one batched LLM call**, not one per source. Cheaper and more consistent; a malformed
    response means fewer sources get re-scored (invented ids are ignored and reported).
13. **Near-duplicate text is not detected.** Dedup is exact hash equality after whitespace normalisation plus URL
    equality, so syndicated copies of an article from different URLs are stored twice.
14. **No API authentication or rate limiting.** Outbound crawling is rate limited; inbound API calls are not.
15. **Upload validation is structural** (extension, size, decodability, NUL bytes) — a hostile but well-formed TXT
    is accepted, and is treated as untrusted data everywhere it is used.
16. **Action tracking stores only the `done` flag** inside `reports.content` JSON (the PRD fixes the schema at six
    tables). Action text cannot be edited.
17. **Interview questions are generated once per company.** Re-running `start` resumes the same set; there is no
    regenerate button, deliberately, because it would discard answers.
18. **Python 3.11.2, not the PRD's 3.12.** 3.12 was not installable here (no apt access, CPython downloads blocked).
    The stack runs unchanged on 3.11; `requirements.txt` does not pin the minor version.
19. **Recharts is used for one component chart only** — there is no dashboard analytics.
20. **No deployment.** No hosting provider was used or tested.

## Targets vs actual

| Target | Actual | Reason if short |
|---|---|---|
| 20 MeetUniversity sources | Not measured — sandbox egress blocked | Live run blocked: no egress to meetuniversity.com, no Groq key |
| 5 to 10 competitors | Not measured — sandbox egress blocked | Same |
| 30 records overall | Not measured — sandbox egress blocked | Same |

Nothing in this table is estimated. To fill it, run `scripts/run_three_companies.py --yes` on a machine with
internet and a Groq key; it prints sources per category, record counts, top signals and the brief id.
