"""Monthly source audit entrypoint.

    python run_audit.py --all
"""

from __future__ import annotations

import argparse
import json
import sys

import audit
import db
from db import Company, SessionLocal, init_db


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit every source's health")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true")
    group.add_argument("--company-id", type=int)
    args = parser.parse_args()

    init_db()
    session = SessionLocal()
    try:
        if args.all:
            results = audit.run_audit_all(session)
        else:
            company = session.get(Company, args.company_id)
            if company is None:
                print(json.dumps({"error": f"company {args.company_id} not found"}), file=sys.stderr)
                return 2
            results = [audit.audit_sources(session, company)]
        print(json.dumps(results, indent=2, default=str))
    finally:
        session.close()
    failed = sum(1 for result in results if result.get("failing"))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
