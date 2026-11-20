# Demo Script (target 8 minutes, hard limit 10)

Preparation (do before recording, not on camera):
- Run the full pipeline once for all three companies so data exists as a fallback.
- Keep a clean second MeetUniversity entry for the live run, or record the live crawl and cut the waiting time.
- Have `demo_data/DEMO_synthetic_support_tickets.csv` ready. It is **synthetic**. Say so on camera.
- Close other tabs. Check the Groq key and internet. Rehearse once with a timer.
- If the Groq key is dead, the app shows a real 503 banner — say that instead of hiding it.

UI tabs per company: **Overview, Interview, Sources, Intelligence, Briefs, Automation**.

## Timeline

| Time | Action | What to say (one line) |
|---|---|---|
| 0:00 | Open app, show the Companies page and health strip | "Signal Stack researches a company, interviews the founder, monitors real sources and writes a Monday brief." |
| 0:30 | Add MeetUniversity (name, site, context) | "Nothing here is hardcoded. The same flow runs for any company." |
| 0:50 | Overview → Run research, open the profile | "Each fact carries an evidence URL. Anything not found on the site is moved to the unverified list." |
| 1:40 | Interview: answer 2 questions, skip 1, trigger a follow-up, edit one answer | "Questions come from the researched profile, follow-ups only after a vague answer, and answers persist through a restart." |
| 2:40 | Sources tab, show the four categories | "Customers, Competitors, Market, Internal. Every source has a reason, reliability and a health status." |
| 3:15 | Run Discover, then approve one, reject one, pause one; open the dropped list | "Candidates are verified by real fetches. Dead links are dropped with a reason and never stored." |
| 3:45 | Point at the competitor sources and the profile's likely_competitors | "Competitors are discovered from the profile and each site is verified." |
| 4:00 | Intelligence → Crawl approved sources, read the numbers, then crawl again | "Second crawl: zero new, duplicates detected. Crawling uses ETag, retries, robots.txt and SSRF protection, and doesn't need the LLM." |
| 4:45 | Analyse new records, open a signal, expand "Why this score" | "Facts are separate from interpretation, and the score is arithmetic over stored components — not an LLM number." |
| 5:30 | Briefs → Generate, scroll the 11 sections, show the citation ids | "Every item cites record IDs that exist in the database." |
| 6:15 | Tick an action, reload, export the Markdown | "Actions persist, and the brief is exportable." |
| 6:30 | Automation → upload the synthetic CSV | "Labelled user-provided, and this sample is synthetic." |
| 7:00 | Run the source audit and the weekly job, show job logs | "Dead URLs are flagged, never deleted. The same jobs run on GitHub Actions cron — the workflow is in the repo." |
| 7:20 | Context change: "University discovery and admission assistance" → "International student recruitment and overseas education consultancy", run reassess ||

| 7:40 | Switch to Razorpay and Zomato, show different questions and sources | "Same code, different company, different output." |
| 8:10 | Open `docs/COST_AND_LIMITATIONS.md` | "Here is what I did not build, the real counts, and the free-tier limits." |

## Fallbacks
- If a crawl is slow: use pre-run data and say it was pre-run.
- If Groq rate-limits (429): show the saved brief from the earlier run and say so.
- If a site blocks the crawler: show the dropped-candidate list — that is the design working.
- Never present pre-run output as live.

## Final checklist
- [ ] Counts spoken on camera match the README table
- [ ] Nothing shown contains secrets (hide `.env` and terminal history)
- [ ] Video under 10 minutes
- [ ] Repo public or access shared, no `.env` or `.db` committed
- [ ] Say which parts were pre-run versus live
