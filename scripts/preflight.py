#!/usr/bin/env python3
"""Signal Stack real-run preflight verification.

Checks local configuration, running servers, LLM reachability, database state,
and outbound public internet egress. Never prints secrets such as GROQ_API_KEY.

Usage:
    python scripts/preflight.py
    python scripts/preflight.py --backend-url http://127.0.0.1:8000 --frontend-url http://127.0.0.1:3000
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _load_env_file(env_path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not env_path.is_file():
        return values
    for raw_line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        values[key.strip()] = val.strip().strip('"').strip("'")
    return values


def run_preflight(
    *,
    root_dir: Path = ROOT,
    backend_url: str = "http://127.0.0.1:8000",
    frontend_url: str = "http://127.0.0.1:3000",
    egress_url: str = "https://example.com/",
    timeout: float = 15.0,
) -> list[tuple[str, bool, str]]:
    """Run all preflight checks and return a list of (check_name, passed, detail)."""
    results: list[tuple[str, bool, str]] = []
    env_path = root_dir / ".env"
    env_file_vars = _load_env_file(env_path)

    def _var(name: str) -> str:
        return (os.getenv(name) or env_file_vars.get(name) or "").strip()

    # 1. .env and GROQ_API_KEY (never expose the secret value)
    groq_key = _var("GROQ_API_KEY")
    if env_path.is_file() and groq_key and groq_key != "replace_with_your_groq_key":
        results.append(("env_and_groq_key", True, f".env present; GROQ_API_KEY is set (length {len(groq_key)})"))
    elif not env_path.is_file():
        results.append(("env_and_groq_key", False, f".env missing at {env_path}"))
    else:
        results.append(("env_and_groq_key", False, "GROQ_API_KEY is missing or placeholder in .env / environment"))

    # 2. DATABASE_URL valid
    db_url = _var("DATABASE_URL") or f"sqlite:///{(BACKEND_DIR / 'signalstack.db').as_posix()}"
    db_valid = db_url.startswith(("sqlite:///", "postgresql://", "postgres://"))
    results.append(
        (
            "database_url",
            db_valid,
            f"DATABASE_URL dialect='{db_url.split('://', 1)[0]}'" if db_valid else f"Invalid DATABASE_URL: {db_url!r}",
        )
    )

    # 3. Backend /api/health on 127.0.0.1
    backend_base = backend_url.rstrip("/")
    health_ok = False
    try:
        r = httpx.get(f"{backend_base}/api/health", timeout=timeout)
        if r.status_code == 200:
            payload = r.json()
            db_ok = bool((payload.get("database") or {}).get("ok"))
            model = (payload.get("llm") or {}).get("model")
            health_ok = payload.get("status") == "ok" and db_ok
            results.append(
                ("backend_health", health_ok, f"{backend_base}/api/health -> {payload.get('status')} (db_ok={db_ok}, model={model})")
            )
        else:
            results.append(("backend_health", False, f"{backend_base}/api/health returned HTTP {r.status_code}"))
    except Exception as exc:
        results.append(("backend_health", False, f"Unreachable at {backend_base}/api/health ({exc.__class__.__name__})"))

    # 4. Existing DB state (empty or lists existing companies)
    if health_ok:
        try:
            comp_res = httpx.get(f"{backend_base}/api/companies?limit=50", timeout=timeout)
            if comp_res.status_code == 200:
                comp_data: dict[str, Any] = comp_res.json()
                total = int(comp_data.get("total", 0))
                names = [c.get("name", f"#{c.get('id')}") for c in comp_data.get("items", [])[:10]]
                detail = "DB is empty (0 companies)" if total == 0 else f"{total} company/companies: {', '.join(names)}"
                results.append(("database_companies", True, detail))
            else:
                results.append(("database_companies", False, f"GET /api/companies returned HTTP {comp_res.status_code}"))
        except Exception as exc:
            results.append(("database_companies", False, f"Failed listing companies ({exc.__class__.__name__})"))
    else:
        results.append(("database_companies", False, "Skipped because backend_health failed"))

    # 5. GROQ_MODEL reachable via /api/llm/healthcheck
    groq_model = _var("GROQ_MODEL") or "llama-3.3-70b-versatile"
    if health_ok:
        try:
            llm_res = httpx.get(f"{backend_base}/api/llm/healthcheck", timeout=max(timeout, 30.0))
            if llm_res.status_code == 200:
                data = llm_res.json()
                results.append(
                    ("llm_healthcheck", True, f"model={data.get('model', groq_model)} status={data.get('status', 'ok')}")
                )
            else:
                detail = llm_res.text[:240]
                results.append(("llm_healthcheck", False, f"HTTP {llm_res.status_code}: {detail}"))
        except Exception as exc:
            results.append(("llm_healthcheck", False, f"Request failed ({exc.__class__.__name__})"))
    else:
        results.append(("llm_healthcheck", False, "Skipped because backend_health failed"))

    # 6. Frontend reachable
    fe_base = frontend_url.rstrip("/")
    try:
        fe_res = httpx.get(fe_base, timeout=timeout, follow_redirects=True)
        ok = fe_res.status_code < 400
        results.append(("frontend_reachable", ok, f"{fe_base} -> HTTP {fe_res.status_code}"))
    except Exception as exc:
        results.append(("frontend_reachable", False, f"Unreachable at {fe_base} ({exc.__class__.__name__})"))

    # 7. Public outbound HTTPS egress
    try:
        eg_res = httpx.get(egress_url, timeout=timeout, follow_redirects=True)
        ok = eg_res.status_code < 400
        results.append(("public_egress", ok, f"{egress_url} -> HTTP {eg_res.status_code}"))
    except Exception as exc:
        results.append(("public_egress", False, f"Outbound HTTPS to {egress_url} failed ({exc.__class__.__name__})"))

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Signal Stack real-run prerequisites.")
    parser.add_argument("--backend-url", default="http://127.0.0.1:8000")
    parser.add_argument("--frontend-url", default="http://127.0.0.1:3000")
    parser.add_argument("--egress-url", default="https://example.com/")
    args = parser.parse_args()

    checks = run_preflight(
        backend_url=args.backend_url,
        frontend_url=args.frontend_url,
        egress_url=args.egress_url,
    )
    all_passed = True
    for name, passed, detail in checks:
        tag = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False
        print(f"[{tag}] {name}: {detail}")

    print("")
    if all_passed:
        print("Preflight PASSED. Next: run `python scripts/run_three_companies.py` and capture its output.")
        return 0
    print("Preflight FAILED. Fix the FAIL items above before running `scripts/run_three_companies.py`.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
