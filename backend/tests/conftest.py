"""Shared test fixtures. All fixture data is TEST_-labelled, never real intelligence."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

# Point the app at a throwaway SQLite file before any project module reads settings.
_TEST_DB_DIR = Path(tempfile.mkdtemp(prefix="signalstack-test-"))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB_DIR / 'signalstack.db'}")

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import safe_fetch  # noqa: E402  (path must be fixed first)


@pytest.fixture(autouse=True)
def isolated_fetch_state(monkeypatch):
    """Deterministic DNS, no rate-limit sleeps, empty robots cache, clean hosts."""
    hosts = {
        "public.test": ["93.184.216.34"],
        "other.test": ["93.184.216.35"],
        "evil.test": ["198.51.100.7"],  # TEST-NET-2, must also be refused
        "internal.test": ["192.168.1.10"],
        "metadata.test": ["169.254.169.254"],
    }

    def fake_resolve(host: str) -> list[str]:
        key = host.lower()
        if key in hosts:
            return hosts[key]
        try:
            import ipaddress

            ipaddress.ip_address(key)
            return [key]
        except ValueError:
            raise safe_fetch.BlockedURL(f"test resolver: unknown host {host!r}", url=host)

    monkeypatch.setattr(safe_fetch, "dns_resolve", fake_resolve)
    safe_fetch.set_rate_limit_override(0.0)
    safe_fetch._robots_cache.clear()
    safe_fetch._last_request_at.clear()
    yield
    safe_fetch.set_rate_limit_override(None)
    safe_fetch._robots_cache.clear()
    safe_fetch._last_request_at.clear()
