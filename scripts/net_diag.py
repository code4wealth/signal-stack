#!/usr/bin/env python3
"""Signal Stack network and TLS diagnostic CLI.

Usage:
    python scripts/net_diag.py
    python scripts/net_diag.py https://stripe.com
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import net_diag  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Diagnose outbound HTTPS / TLS connectivity for Signal Stack.")
    parser.add_argument("target_url", nargs="?", default=None, help="Optional extra target URL to test")
    parser.add_argument("--timeout", type=float, default=8.0, help="Per-host timeout in seconds (default 8)")
    parser.add_argument("--json", action="store_true", help="Output structured JSON")
    args = parser.parse_args()

    report = net_diag.diagnose_network(target_url=args.target_url, timeout=args.timeout)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        for line in net_diag.format_report_lines(report):
            print(line)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
