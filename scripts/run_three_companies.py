#!/usr/bin/env python3
"""Drive the whole pipeline for the demo companies through the real HTTP API.

This is a demo driver, not application logic: the companies live in
scripts/demo_companies.json as data. Nothing in backend/ knows their names.

    python scripts/run_three_companies.py --base-url http://127.0.0.1:8000
    python scripts/run_three_companies.py --only meetuniversity --skip-interview --yes
    python scripts/run_three_companies.py --reassess meetuniversity \
        --context "International student recruitment and overseas education consultancy"

Every number printed at the end is read back from the API - nothing is estimated.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parent
EXPORT_DIR = ROOT.parent / "exports"


class Runner:
    def __init__(self, base_url: str, timeout: float = 180.0):
        self.client = httpx.Client(base_url=base_url.rstrip("/"), timeout=timeout)

    def call(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self.client.request(method, path, **kwargs)
        if response.status_code >= 400:
            detail = response.text[:400]
            raise SystemExit(f"{method} {path} -> {response.status_code}: {detail}")
        if response.status_code == 204:
            return None
        return response.json()

    # --- pipeline steps ---------------------------------------------------- #
    def create_company(self, data: dict) -> dict:
        payload = {k: data[k] for k in ("name", "website", "context") if k in data}
        return self.call("POST", "/api/companies", json=payload)

    def research(self, company_id: int) -> dict:
        return self.call("POST", f"/api/companies/{company_id}/research")

    def interview(self, company_id: int, non_interactive: bool) -> dict:
        state = self.call("POST", f"/api/companies/{company_id}/interview/start")
        while state["current_idx"] is not None:
            idx = state["current_idx"]
            question = next(item for item in state["questions"] if item["idx"] == idx)["question"]
            if non_interactive:
                state = self.call(
                    "POST", f"/api/companies/{company_id}/interview/answer", json={"idx": idx, "skip": True}
                )
                continue

            print(f"\n  Q{idx + 1}/{len(state['questions'])}: {question}")
            try:
                answer = input("  answer (blank = skip)> ").strip()
            except EOFError:
                answer = ""
            if not answer:
                state = self.call(
                    "POST", f"/api/companies/{company_id}/interview/answer", json={"idx": idx, "skip": True}
                )
            else:
                state = self.call(
                    "POST", f"/api/companies/{company_id}/interview/answer", json={"idx": idx, "answer": answer}
                )

        if non_interactive:
            return self.call("GET", f"/api/companies/{company_id}/interview")
        self.call("POST", f"/api/companies/{company_id}/interview/complete")
        return self.call("GET", f"/api/companies/{company_id}/interview")

    def discover_and_approve(self, company_id: int, auto_approve: bool) -> dict:
        result = self.call("POST", f"/api/companies/{company_id}/sources/discover")
        if auto_approve:
            for source in result.get("created", []):
                self.call("POST", f"/api/sources/{source['id']}/approve")
        return result

    def crawl(self, company_id: int) -> dict:
        return self.call("POST", f"/api/companies/{company_id}/crawl")

    def analyse(self, company_id: int) -> dict:
        return self.call("POST", f"/api/companies/{company_id}/analyse")

    def brief(self, company_id: int) -> dict | None:
        try:
            return self.call("POST", f"/api/companies/{company_id}/reports/generate")
        except SystemExit as exc:
            print(f"  brief not generated: {exc}")
            return None

    def sources(self, company_id: int) -> dict:
        return self.call("GET", f"/api/companies/{company_id}/sources?limit=500")

    def intelligence(self, company_id: int) -> dict:
        return self.call("GET", f"/api/companies/{company_id}/intelligence?limit=200")


def run_company(runner: Runner, data: dict, args: argparse.Namespace) -> dict:
    print(f"\n=== {data['name']} ({data['website']}) ===")
    company = runner.create_company(data)
    company_id = company["id"]
    print(f"  company #{company_id} created")

    profile = runner.research(company_id)
    print(f"  research: {len(profile['pages_fetched'])} pages, {profile['unverified_count']} unverified items")

    if args.skip_interview:
        print("  interview skipped (--skip-interview)")
    else:
        state = runner.interview(company_id, non_interactive=False)
        print(f"  interview: {state['answered']} answered, {state['skipped']} skipped")

    discovery = runner.discover_and_approve(company_id, auto_approve=args.yes)
    print(
        f"  discovery: {discovery['created_count']} verified sources stored, "
        f"{discovery['dropped_count']} dropped"
    )

    crawl = runner.crawl(company_id)
    print(
        f"  crawl: {crawl.get('sources_checked', 0)} sources, {crawl.get('new_records', 0)} new, "
        f"{crawl.get('updated_records', 0)} updated, {crawl.get('duplicates', 0)} duplicates, "
        f"{crawl.get('errors', 0)} errors"
    )

    analysis = runner.analyse(company_id)
    print(
        f"  analysis: {analysis['analysed']} analysed, {analysis['failed']} failed, "
        f"{analysis['evidence_flagged']} evidence flags"
    )

    sources = runner.sources(company_id)
    by_category: dict[str, dict[str, int]] = {}
    for source in sources["items"]:
        bucket = by_category.setdefault(source["category"], {"approved": 0, "pending": 0, "total": 0})
        bucket["total"] += 1
        if source["status"] in bucket:
            bucket[source["status"]] += 1

    intel = runner.intelligence(company_id)
    report = runner.brief(company_id)

    summary = {
        "company": data["name"],
        "company_id": company_id,
        "sources_total": sources["total"],
        "sources_by_category": by_category,
        "records_analysed": intel["total"],
        "top_signals": [
            {"id": item["id"], "title": item["title"], "total": item["total"], "url": item["url"]}
            for item in intel["items"][:5]
        ],
        "report_id": report["id"] if report else None,
        "report_actions": len(report["content"]["actions"]) if report else 0,
        # every generated question, so AC3 ("questions differ per company") is provable from the output
        "questions": [
            {"idx": question["idx"], "is_followup": question["is_followup"], "question": question["question"]}
            for question in runner.call("GET", f"/api/companies/{company_id}/interview")["questions"]
        ],
        "crawl_history": runner.call("GET", f"/api/companies/{company_id}/crawl-history")["items"][:2],
    }
    print(f"  sources: {sources['total']} total ({json.dumps(by_category)}), records analysed: {intel['total']}")
    if report:
        print(f"  brief #{report['id']} with {len(report['content']['actions'])} actions")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--companies", default=str(ROOT / "demo_companies.json"))
    parser.add_argument("--only", help="run a single company key from the JSON file")
    parser.add_argument("--yes", action="store_true", help="auto-approve every verified source")
    parser.add_argument("--skip-interview", action="store_true", help="skip all interview questions")
    parser.add_argument("--reassess", help="company key to reassess with --context after the run")
    parser.add_argument("--context", help="new context for --reassess")
    args = parser.parse_args()

    companies = json.loads(Path(args.companies).read_text())
    if args.only:
        companies = [company for company in companies if company["key"] == args.only]
        if not companies:
            raise SystemExit(f"no company with key {args.only!r} in {args.companies}")

    runner = Runner(args.base_url)
    summaries = []
    for company in companies:
        summaries.append(run_company(runner, company, args))

    if args.reassess:
        if not args.context:
            raise SystemExit("--reassess requires --context")
        target = next((item for item in summaries if item["company"].lower().startswith(args.reassess[:4])), None)
        if target is None:
            match = next((company for company in companies if company["key"] == args.reassess), None)
            if match is None:
                raise SystemExit(f"no company matching {args.reassess!r}")
            company_id = runner.create_company(match)["id"]
        else:
            company_id = target["company_id"]
        result = runner.call(
            "POST", f"/api/companies/{company_id}/context/reassess", json={"context": args.context}
        )
        print(f"\n=== context reassessment: {result['scored']} sources scored ===")
        for item in result["updated"]:
            flag = "  <-- recommend removal" if item["relevance"] < 0.4 else ""
            print(f"  {item['name']}: {item['relevance']:.2f} ({item['reason']}){flag}")
        summaries.append({"reassessment": result})

    EXPORT_DIR.mkdir(exist_ok=True)
    out = EXPORT_DIR / "demo_run.json"
    out.write_text(json.dumps(summaries, indent=2))
    for summary in summaries:
        if "company_id" not in summary:
            continue
        slug = "".join(ch if ch.isalnum() else "-" for ch in summary["company"].lower()).strip("-")
        (EXPORT_DIR / f"demo_{slug}.json").write_text(json.dumps(summary, indent=2))
    print(f"\nSummary written to {out}")
    print(json.dumps(summaries, indent=2)[:4000])
    return 0


if __name__ == "__main__":
    sys.exit(main())
