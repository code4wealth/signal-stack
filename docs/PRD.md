# PRD: Signal Stack (EDXSO AI Engineer Intern, Assignment 1)

## 1. Summary
Signal Stack is an AI company-intelligence engine. A user enters a company name and website. The system researches the company, interviews the founder with company-specific questions, discovers and verifies public sources in four categories (Customers, Competitors, Market, Internal), crawls them, extracts evidence-backed signals, ranks them transparently, and generates a Monday Morning Brief.

Demo companies: MeetUniversity (mandatory, https://www.meetuniversity.com), Razorpay (fintech), Zomato (food delivery). None of them may be hardcoded in application logic.

## 2. Hard constraints
- Time budget: about 6 hours total. Scope is cut deliberately (section 4).
- Free tools and free tiers only. No paid APIs, scrapers or search.
- No fabricated sources, records, competitors, news or intelligence. Ever.
- Never claim a feature works unless it has been run and verified.
- Secrets only in `.env`. Never committed.

## 3. Goals and non-goals
Goals:
1. A working end-to-end pipeline: research, interview, sources, crawl, analyse, rank, brief.
2. Evidence traceability: every signal and report claim links to a real stored URL and a verbatim snippet.
3. Same code, three different companies, three different outputs.
4. Honest documentation of limits.

Non-goals (state these in the README):
- Multi-user auth, billing, multi-tenant isolation.
- Browser rendering of JavaScript-heavy sites.
- PDF export, Alembic migrations, full normalized 18-table schema.
- Bypassing paywalls, logins, CAPTCHAs or robots.txt.

## 4. Scope tiers
| Tier | Feature | Depth |
|---|---|---|
| P0 | Company research (website crawl, structured profile, verified/unverified facts) | Full |
| P0 | Adaptive founder interview (10 questions, follow-ups, persist, skip, edit, resume) | Full |
| P0 | Source discovery, four categories, URL-verified | Full |
| P0 | Real crawler (RSS and pages, hash, dedup, ETag, retries, robots, SSRF safe) | Full |
| P0 | Evidence-backed analysis plus transparent ranking | Full |
| P0 | Monday Brief (11 sections, saved, history, Markdown export, copy) | Full |
| P1 | Three companies end to end | Full |
| P1 | Source management (add, remove, approve, reject, pause, errors) | Full |
| P1 | Context reassessment (MeetUniversity demo) | Real relevance re-scoring |
| P2 | Internal document upload | TXT and CSV only |
| P2 | Weekly job and monthly audit | GitHub Actions cron plus manual trigger, logs shown in UI |
| P2 | Action tracking | Checkbox persisted |
| P3 | README, limitations doc, demo script | Required |

## 5. Stack
- Backend: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, SQLite (Postgres-ready via SQLAlchemy URL), httpx, BeautifulSoup, trafilatura, feedparser, pandas, APScheduler, Groq SDK.
- Frontend: Next.js, React, TypeScript, Tailwind, shadcn/ui, Lucide, Recharts.
- Palette: bg #06111D, secondary #0B1B2A, card #102638, primary #3B82F6, accent #38BDF8, success #2DD4BF.
- Honest note for docs: SQLite and JSON columns were chosen for the time budget.

## 6. Data model (6 tables)
- `companies`: id, name, website, context, profile (JSON), created.
- `qa`: id, company_id, idx, question, answer, skipped, is_followup.
- `sources`: id, company_id, name, url, feed_url, category, reason, expected, reliability, status (pending|approved|rejected|paused), health, relevance, etag, last_modified, last_checked, last_ok, last_error.
- `records`: id, company_id, source_id, url, title, text, published, discovered, content_hash (indexed), analysis (JSON), scores (JSON), total (indexed).
- `reports`: id, company_id, created, content (JSON), markdown.
- `job_logs`: id, company_id, job, status, detail, at.

Rules: foreign keys with ON DELETE CASCADE, indexes on `company_id`, `content_hash`, `total`.

## 7. Pipeline
1. Research: fetch homepage plus up to 5 relevant internal pages, extract text, LLM builds `Profile`. Each fact has `evidence_url` and `verified`. Inferences go in `unverified`.
2. Interview: generate 10 company-specific questions from the profile, one at a time. A follow-up is allowed only if the answer is vague (max 3 follow-ups), never repeating a question. Complete step merges answers into `profile["intelligence"]`.
3. Discovery: LLM proposes candidates. Each URL is fetched and verified. Unreachable or blocked candidates are dropped. RSS feed autodiscovery. Status starts `pending`. Competitor profiles come from `likely_competitors`, each with a verified site.
4. Crawl (no LLM involved): approved sources only. Conditional GET, retries with exponential backoff, 15 s timeout, 1 req/s per host, 3 MB cap. Hash content, dedup by URL and hash, same URL with new hash is stored as `[UPDATED]`. Failures recorded on the source.
5. Analyse: each new record gets an `Analysis`. The evidence snippet must appear verbatim in the source text. If not, evidence_strength is capped at 0.2 and flagged.
6. Rank: deterministic code (section 9). Components stored.
7. Brief: records limited to ids from the database. LLM writes prose only. Returned citation ids are validated. Actions without valid evidence are dropped. Empty categories use the exact sentence "No meaningful verified development was identified during this monitoring period."
8. Context reassess: re-score each source's relevance against the new profile (LLM, 0 to 1 with reason). Below 0.4 means "recommend removal, needs user approval", never auto-delete. Run discovery for new candidates.

## 8. API (prefix `/api`)
Companies: `POST /companies`, `GET /companies`, `GET /companies/{id}`, `PATCH /companies/{id}`, `POST /companies/{id}/research`
Profile: `GET|PATCH /companies/{id}/profile`
Interview: `POST /companies/{id}/interview/start`, `GET /companies/{id}/interview`, `POST /companies/{id}/interview/answer`, `PATCH /interview/answers/{id}`, `POST /companies/{id}/interview/complete`
Sources: `GET /companies/{id}/sources`, `POST /companies/{id}/sources/discover`, `POST /companies/{id}/sources`, `PATCH /sources/{id}`, `DELETE /sources/{id}`, `POST /sources/{id}/approve`
Crawl and intelligence: `POST /companies/{id}/crawl`, `GET /companies/{id}/crawl-history`, `GET /companies/{id}/intelligence`, `GET /signals/{id}`
Documents: `POST /companies/{id}/documents`, `GET /companies/{id}/documents`
Reports: `POST /companies/{id}/reports/generate`, `GET /companies/{id}/reports`, `GET /reports/{id}`, `GET /reports/{id}/export`
Automation: `POST /companies/{id}/automation/run`, `POST /companies/{id}/source-audit`, `GET /companies/{id}/job-logs`
Context: `POST /companies/{id}/context/reassess`

All list endpoints are paginated (`limit`, `offset`). All errors return JSON `{detail}`.

## 9. Ranking
Score = 100 x sum(weight x component), all components in 0 to 1:
relevance 0.25, impact 0.25, urgency 0.15, source credibility 0.15, recency 0.10, novelty 0.10.
- relevance, impact, urgency: LLM-estimated, stored.
- credibility: source reliability (code).
- recency: max(0, 1 - age_days/30) (code).
- novelty: 1.0 if new, 0.3 if update (code).
Keep source reliability, evidence strength and strategic relevance as three separate stored fields. Store an explanation string per record.

## 10. Security
URL validation (http/https only), block private, loopback, link-local, reserved and metadata IPs, re-validate every redirect hop, robots.txt compliance, rate limit, concurrency cap (max 4), response size cap, upload limits (2 MB, extension and content check), untrusted content wrapped in `<untrusted_source>` tags and never merged into system instructions, no secrets in logs. Known gap to document: DNS rebinding between check and connect.

## 11. Acceptance criteria (all must be demonstrably true)
- AC1: Creating a company never uses hardcoded competitors or sources.
- AC2: MeetUniversity profile cites page URLs and lists unverified items.
- AC3: Interview questions differ across the three companies (show the 3 lists).
- AC4: Interview answers persist across a server restart.
- AC5: Every stored source passed a real fetch. Report the true count per category.
- AC6: Crawl produces records with original URL, discovery timestamp and content hash. Second crawl creates no duplicates.
- AC7: SSRF tests pass for 127.0.0.1, 10.x, 169.254.169.254 and a redirect to a private IP.
- AC8: Every report claim cites record ids that exist.
- AC9: Ranking explanation visible per record.
- AC10: Weekly job and audit run and write `job_logs`, visible in UI.
- AC11: Context reassessment changes at least some source relevance scores for MeetUniversity, with reasons.
- AC12: README reproduces setup from scratch. Limitations are listed.
Targets (report actual numbers, never inflate): at least 20 approved MeetUniversity sources, 5 to 10 competitors, at least 30 real records across the 3 demos.

## 12. Honesty rules
- Report true counts. If under target, state the limit and cause.
- Demo/test data is labelled `DEMO_` or `TEST_` and never mixed into intelligence records.
- Internal uploads are labelled "user-provided".
- Unimplemented UI items are omitted or marked "not implemented", never fake buttons.

## 13. Phases and gates
| Phase | Time | Gate (must pass before next) |
|---|---|---|
| 0 Setup | 25 min | `uvicorn` starts, `/docs` loads, Groq test call returns JSON |
| 1 Fetcher | 20 min | SSRF and robots tests pass |
| 2 Research | 30 min | MeetUniversity profile stored with evidence URLs |
| 3 Interview | 35 min | start, answer, skip, edit, resume, complete all work via curl |
| 4 Sources | 45 min | verified sources stored in 4 categories, approve flow works |
| 5 Crawl + analyse + rank | 60 min | records stored, dedup verified on second run, scores explained |
| 6 Brief | 35 min | brief saved, citations validated, Markdown export works |
| 7 UI | 55 min | every page calls a real endpoint |
| 8 Extras | 25 min | reassess, upload, audit, cron file |
| 9 Docs + demo | 20 min | README, limitations, demo script |

## 14. Risks
| Risk | Mitigation |
|---|---|
| Groq rate limits | cap 40 analyses per run, sleep between calls, retry with backoff |
| Thin or JS-rendered site | surface as unverified, do not guess |
| LLM invents URLs | verify every URL by fetching, drop failures |
| Scheduler dies on sleeping host | GitHub Actions cron plus documented limitation |
| Scope creep | tier table is binding, cut P2 before P0 |
| Actions runner lacks persistent SQLite | commit DB artifact or use Supabase, document the choice |

## 15. Deliverables
Repo, README, `docs/` (architecture, limitations, demo script), tests, 5 to 10 minute demo video, honest statement of counts and limits.
