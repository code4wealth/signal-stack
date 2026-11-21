"""Remove duplicate Company, Source, Record, and QA rows from Signal Stack's database."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import db  # noqa: E402
import dedup  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Remove duplicate rows from the Signal Stack database.")
    parser.add_argument("--dry-run", action="store_true", help="Report duplicate counts without modifying the database.")
    parser.add_argument(
        "--merge-companies",
        action="store_true",
        help="Also merge duplicate same-name/same-website companies that already have records or reports.",
    )
    args = parser.parse_args()

    db.init_db()
    with db.SessionLocal() as session:
        summary = dedup.deduplicate_database(
            session,
            dry_run=args.dry_run,
            merge_companies=args.merge_companies,
        )
    mode = "DRY RUN" if args.dry_run else "CLEANED"
    print(f"[{mode}] {summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
