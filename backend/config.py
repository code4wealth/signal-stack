"""Configuration loaded from environment (.env never committed).

Two locations are honoured, in this order, and never override real environment variables:

    ./.env            (repo root — what the README says)
    ./backend/.env    (what earlier instructions in this repo said)

Order matters: with ``override=False`` the first file to define a key wins, so a repo-root
``.env`` beats ``backend/.env`` and a real environment variable beats both.
"""

from __future__ import annotations

import os
import ssl
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_env_files(root: Path = REPO_ROOT) -> list[Path]:
    """Load ``.env`` then ``backend/.env`` under *root*; first definition of a key wins."""

    loaded: list[Path] = []
    for candidate in (root / ".env", root / "backend" / ".env"):
        if candidate.is_file():
            load_dotenv(candidate, override=False)
            loaded.append(candidate)
    return loaded


load_env_files()


def ca_bundle_path() -> str | None:
    """Optional CA bundle for TLS-inspecting networks (corporate proxies, sandboxes).

    Honours the conventional variables in order. Returns None when unset or when the file does
    not exist, in which case callers keep their normal verification — this never *disables*
    certificate checking, it only adds a trust anchor.
    """

    for name in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"):
        value = os.getenv(name)
        if value and Path(value).is_file():
            return value
    return None


def ssl_trust_source() -> str:
    """Describe which CA trust mechanism `build_ssl_context()` will use."""
    if ca_bundle_path():
        return "env-ca-bundle"
    try:
        import truststore  # noqa: F401

        return "os-truststore"
    except Exception:
        return "certifi"


def build_ssl_context() -> ssl.SSLContext:
    """Create a verified TLS client SSLContext using env CA bundle -> OS truststore -> certifi."""
    ca_path = ca_bundle_path()
    if ca_path:
        return ssl.create_default_context(cafile=ca_path)

    try:
        import truststore

        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except Exception:
        pass

    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    groq_api_key: str | None
    groq_model: str
    database_url: str
    max_analyses_per_run: int
    crawl_concurrency: int
    fetch_timeout_seconds: int
    fetch_max_bytes: int
    fetch_requests_per_second: int
    user_agent: str
    cors_extra_origins: tuple[str, ...] = ()

    @property
    def has_groq_key(self) -> bool:
        return bool(self.groq_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    default_db = f"sqlite:///{REPO_ROOT / 'backend' / 'signalstack.db'}"
    return Settings(
        groq_api_key=os.getenv("GROQ_API_KEY") or None,
        groq_model=(os.getenv("GROQ_MODEL") or "").strip() or "llama-3.3-70b-versatile",
        database_url=(os.getenv("DATABASE_URL") or "").strip() or default_db,
        max_analyses_per_run=_int("MAX_ANALYSES_PER_RUN", 40),
        crawl_concurrency=_int("CRAWL_CONCURRENCY", 4),
        fetch_timeout_seconds=_int("FETCH_TIMEOUT_SECONDS", 15),
        fetch_max_bytes=_int("FETCH_MAX_BYTES", 3 * 1024 * 1024),
        fetch_requests_per_second=_int("FETCH_REQUESTS_PER_SECOND", 1),
        user_agent=os.getenv("USER_AGENT", "SignalStackBot/0.1 (+research; see README)"),
        cors_extra_origins=tuple(
            origin.strip()
            for origin in os.getenv("CORS_EXTRA_ORIGINS", "").split(",")
            if origin.strip()
        ),
    )
