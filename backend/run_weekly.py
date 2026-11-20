"""Weekly job entrypoint - used by GitHub Actions and by hand.

    python run_weekly.py --all
    python run_weekly.py --company-id 1

Exit code is non-zero when a company's pipeline failed, so CI surfaces it.
"""

from __future__ import annotations

import argparse
import json
import sys

import audit
import db
from db import Company, SessionLocal, init_db


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the weekly crawl + analyse + brief job")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true", help="run every company in the database")
    group.add_argument("--company-id", type=int, help="run one company")
    args = parser.parse_args()

    init_db()
    session = SessionLocal()
    failures = 0
    try:
        if args.all:
            results = audit.run_weekly_all(session)
            for result in results:
                if not result.get("report_id"):
                    failures += 1
        else:
            company = session.get(Company, args.company_id)
            if company is None:
                print(json.dumps({"error": f"company {args.company_id} not found"}), file=sys.stderr)
                return 2
            results = [audit.run_weekly(session, company)]
            if not results[0].get("report_id"):
                failures += 1
        print(json.dumps(results, indent=2, default=str))
    finally:
        session.close()
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
