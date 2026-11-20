# Demo script (5–10 minutes)

Target: show the pipeline is real, that it cites what it claims, and that it says "I don't know" instead of
inventing. Prepare before recording: backend running, `.env` has `GROQ_API_KEY`, three companies already
processed, one brief generated, browser on `http://localhost:3000`.

## 0. Setup shot (20 s)
- Terminal: `curl -s localhost:8000/api/health | python -m json.tool` — six tables, model name, key configured.
- Say: "FastAPI + SQLite + Groq. Six tables, no fabricated data anywhere."

## 1. Create a company from data, not code (45 s)
- On `/`, create a company (name + website + context).
- Say: "Nothing about this company exists in the code. `grep -ri meetuniversity backend/` returns nothing."

## 2. Research (60 s)
- Open the company → **Run research**.
- Point at: pages fetched, the **verified** facts with `source` links, the **Unverified** box.
- Say: "Every fact had to cite a page we actually fetched. Anything the model inferred without page evidence was
  demoted into the unverified list — and it is labelled as such."

## 3. Interview (75 s)
- **Interview** tab → Start. Answer two questions properly, skip one.
- Deliberately give one vague answer ("not sure, various things") to trigger a follow-up; note the follow-up
  badge and the 3-follow-up counter.
- Reload the page (or restart uvicorn off-camera beforehand) — answers are still there.
- Say: "Persisted in SQLite per question, so a restart mid-interview loses nothing."

## 4. Sources and discovery (75 s)
- **Sources** tab → Discover.
- Show the counts: created vs dropped, and open the dropped list.
- Say: "Every candidate was fetched before being stored. These were dropped because they did not resolve — they
  are not stored as sources."
- Approve two, reject one. Show the category counts and the reliability score.

## 5. Crawl, analyse, rank (90 s)
- **Intelligence** → Crawl approved sources. Read out: sources checked, new, duplicates, errors.
- Run it again immediately: new = 0, duplicates > 0. That is AC6.
- Analyse new records. Then open a signal → **Why this score**: six components, the weights, the explanation, the
  verbatim snippet, the source reliability.
- Say: "Ranking is arithmetic, not vibes. If the snippet had not been found verbatim in the page, the evidence
  strength would be capped at 0.2 and flagged."

## 6. The brief (75 s)
- **Briefs** → Generate. Scroll the 11 sections.
- Point at: top five chosen by score, "Citations: record N" lines, an empty category showing the exact sentence,
  an action checkbox — tick it, reload, it stays ticked.
- Click **Export .md** (downloads) and **Copy markdown**.

## 7. Context reassessment (60 s)
- **Automation** → new context for MeetUniversity: "International student recruitment and overseas education
  consultancy" → **Reassess sources**.
- Show before/after relevance with reasons, and the "recommended for removal, needs your approval" list.
- Say: "Nothing was deleted. Below 0.4 means recommended, and the sources are still there."

## 8. Automation + honesty (45 s)
- Run the weekly job and the audit; show the `job_logs` table entries.
- Upload a TXT file; show it labelled user-provided and stored as an `internal` source.
- Close on the honest numbers: `docs/acceptance.md` — what passed, what is not verified, what was cut and why.
