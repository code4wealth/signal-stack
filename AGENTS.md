# AGENTS.md: Agent contract for Signal Stack

Applies to any coding agent (Claude Code, Codex, Cursor, others). `CLAUDE.md` holds Claude-specific detail. This file is the shared contract. Source of truth for scope: `docs/PRD.md`.

## Mission
Build a real, evidence-backed company intelligence pipeline within about 6 hours. A smaller build that is real and honest beats a larger one with fake data.

## Build order (do not reorder)
Setup, safe fetcher, research, interview, source discovery, crawler and analysis and ranking, brief, UI, extras, docs. UI work does not start until `curl` can produce a brief for MeetUniversity.

## Roles (one agent may play all, sequentially)
- Architect: checks PRD alignment, keeps scope tiers, refuses scope creep.
- Backend engineer: implements modules in `backend/`.
- AI engineer: owns `llm.py`, prompts and Pydantic schemas.
- Frontend engineer: owns `frontend/`, wires pages to real endpoints only.
- QA: writes tests, runs gates, tries to break SSRF, dedup, citation validation.
- Reviewer: before each commit, checks rules below and the diff.

## Hard rules
1. No fabrication of any intelligence data or counts.
2. All outbound HTTP via `safe_fetch.fetch` (SSRF block, redirect re-validation, robots.txt, rate limit, size cap).
3. All LLM calls via `llm.ask` with a Pydantic model. Crawled content only inside `<untrusted_source>`.
4. Crawling is independent of the LLM.
5. Every record keeps original URL, discovery timestamp, content hash.
6. Every report citation id must exist in the database. Strip invalid ones.
7. Empty category text is exactly: "No meaningful verified development was identified during this monitoring period."
8. No hardcoded company, competitor or source in logic.
9. No secrets in code, logs or commits.
10. Never state a feature works without running it.

## Task protocol
1. Identify phase and acceptance criteria.
2. Inspect existing files. Never overwrite blindly.
3. Implement minimal change plus tests.
4. Run: `pytest -q`, `npx tsc --noEmit`, start the app, hit the endpoint.
5. Fix root causes. Do not delete or weaken a test to make it pass.
6. Report verified results, failures and next step. Commit.

## Gate checklist before moving phases
- [ ] Tests for this phase pass
- [ ] App starts without errors
- [ ] Endpoint exercised with real input (show response summary)
- [ ] No secrets in `git diff`
- [ ] README or docs updated if behavior changed
- [ ] Limitations list updated if something was cut

## Prohibited
Paid APIs, scraping through logins or CAPTCHAs, ignoring robots.txt, placeholder buttons, mock data presented as real, force-push, deleting user data, committing `.env` or `*.db`.

## Reporting format
Each phase report: **Files changed**, **Verified working**, **Known issues**, **Counts (real)**, **Next**.
