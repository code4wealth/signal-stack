# CLAUDE.md: Signal Stack

Read `docs/PRD.md` and `AGENTS.md` fully before changing anything. The PRD is the source of truth for scope. If a request conflicts with it, say so and ask.

## What this project is
AI company-intelligence engine for the EDXSO AI Engineer Intern assignment. Python FastAPI backend, Next.js frontend, SQLite, Groq LLM. About 6 hours total build time.

## Commands
Backend (run from `backend/`):
- Install: `pip install -r requirements.txt`
- Run: `uvicorn main:app --reload --port 8000`
- Test: `pytest -q`
- Test one file: `pytest tests/test_safe_fetch.py -q`
Frontend (run from `frontend/`):
- Install: `npm install`
- Dev: `npm run dev`
- Type check: `npx tsc --noEmit`
- Lint: `npm run lint`
Always run the relevant tests plus the type check before reporting a task done.

## Layout
- `backend/main.py` FastAPI app and routers
- `backend/db.py` models, engine, session
- `backend/safe_fetch.py` all outbound HTTP goes through here, no exceptions
- `backend/llm.py` the only module that calls Groq
- `backend/research.py`, `interview.py`, `discovery.py`, `crawler.py`, `analysis.py`, `ranking.py`, `brief.py`, `context.py`, `documents.py`, `audit.py`
- `backend/tests/` pytest, LLM mocked
- `frontend/` Next.js app
- `.github/workflows/weekly.yml` scheduled brief

## Non-negotiable rules
1. Never fabricate sources, records, competitors, news, quotes or counts.
2. Never call `httpx` or `requests` directly. Use `safe_fetch.fetch`.
3. Never put crawled text in a system prompt. Only inside `<untrusted_source>` tags via `llm.ask`.
4. Every LLM output is a Pydantic model. Invalid output retries, then fails loudly.
5. Crawling never calls the LLM. Analysis never blocks crawling.
6. Never hardcode a company name, competitor or source URL in application code. Demo companies exist only as data entered through the API or as `DEMO_` fixtures.
7. Secrets only from environment. Never print, log or commit them. Check `.gitignore` before the first commit.
8. Do not rewrite or delete working code without reading it first.
9. Do not add paid services or new dependencies without telling me why.
10. Do not claim something works unless you ran it in this session and saw the output.

## Workflow for every task
1. Restate the task and which PRD phase and acceptance criteria it serves.
2. Read the files you will touch.
3. Make the smallest change that satisfies it.
4. Write or update a test first when logic is involved.
5. Run the test, then the app. Show the actual command output summary.
6. If something fails: find the root cause, fix it, rerun. Do not skip, mock around or silence the failure.
7. Report: files changed, what works (verified), what does not, next step.
8. Commit with a clear message after each passing phase gate. Keep the app runnable at every commit.

## Error handling standard
- External calls: timeout, retry with exponential backoff, typed failure recorded on the source or job log.
- API: validate input with Pydantic, return JSON errors with correct status codes (400, 404, 422, 429, 502).
- No bare `except:` that hides errors. Log a safe message, never secrets.

## Style
Python: type hints, small functions, no dead code. TypeScript: strict mode, no `any`. UI: dark navy theme from PRD, loading, empty and error states on every data view, no decorative buttons.

## When to stop and ask me
Only for: a missing credential, a decision that changes PRD scope, or a destructive action. Otherwise decide, explain in one or two sentences, and proceed.

## Definition of done (per phase)
Gate in PRD section 13 passes, tests green, no type errors, app starts, summary written honestly.
