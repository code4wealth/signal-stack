"""The .env loader must find the key in either documented location.

Regression guard: the README says `cp .env.example .env` (repo root) while earlier
instructions said `backend/.env`. A key written to the "wrong" one used to be ignored
silently, which looks exactly like a missing key in the UI.
"""

from __future__ import annotations

import os
from pathlib import Path

import config


def _clean(*names: str) -> None:
    for name in names:
        os.environ.pop(name, None)


def test_root_env_is_loaded(tmp_path: Path) -> None:
    (tmp_path / ".env").write_text("TEST_DOTENV_ROOT=from-root\n")
    _clean("TEST_DOTENV_ROOT")
    try:
        loaded = config.load_env_files(tmp_path)
        assert [path.name for path in loaded] == [".env"]
        assert os.environ["TEST_DOTENV_ROOT"] == "from-root"
    finally:
        _clean("TEST_DOTENV_ROOT")


def test_backend_env_is_loaded_when_present(tmp_path: Path) -> None:
    (tmp_path / "backend").mkdir()
    (tmp_path / "backend" / ".env").write_text("TEST_DOTENV_BACKEND=from-backend\n")
    _clean("TEST_DOTENV_BACKEND")
    try:
        loaded = config.load_env_files(tmp_path)
        assert [path.relative_to(tmp_path) for path in loaded] == [Path("backend") / ".env"]
        assert os.environ["TEST_DOTENV_BACKEND"] == "from-backend"
    finally:
        _clean("TEST_DOTENV_BACKEND")


def test_root_wins_over_backend_and_real_env_wins_over_both(tmp_path: Path) -> None:
    (tmp_path / ".env").write_text("TEST_DOTENV_SHARED=root\nTEST_DOTENV_REAL=from-file\n")
    (tmp_path / "backend").mkdir()
    (tmp_path / "backend" / ".env").write_text("TEST_DOTENV_SHARED=backend\nTEST_DOTENV_REAL=from-file\n")

    _clean("TEST_DOTENV_SHARED")
    os.environ["TEST_DOTENV_REAL"] = "from-process"
    try:
        config.load_env_files(tmp_path)
        assert os.environ["TEST_DOTENV_SHARED"] == "root", "repo-root .env must win"
        assert os.environ["TEST_DOTENV_REAL"] == "from-process", "existing env vars must win"
    finally:
        _clean("TEST_DOTENV_SHARED", "TEST_DOTENV_REAL")


def test_missing_env_files_are_not_an_error(tmp_path: Path) -> None:
    assert config.load_env_files(tmp_path) == []


def test_settings_read_the_key_from_whichever_file_exists(tmp_path: Path, ) -> None:
    """End-to-end: a key in backend/.env reaches Settings, not just os.environ."""

    (tmp_path / "backend").mkdir()
    (tmp_path / "backend" / ".env").write_text("GROQ_API_KEY=test-not-a-real-key\n")
    original = os.environ.get("GROQ_API_KEY")
    os.environ.pop("GROQ_API_KEY", None)
    try:
        config.load_env_files(tmp_path)
        fresh = config.Settings(
            groq_api_key=os.getenv("GROQ_API_KEY") or None,
            groq_model="test-model",
            database_url="sqlite://",
            max_analyses_per_run=1,
            crawl_concurrency=1,
            fetch_timeout_seconds=1,
            fetch_max_bytes=1,
            fetch_requests_per_second=1,
            user_agent="test",
        )
        assert fresh.has_groq_key is True
    finally:
        _clean("GROQ_API_KEY")
        if original is not None:
            os.environ["GROQ_API_KEY"] = original


# --- CA bundle resolution (TLS-inspecting networks) -------------------------------


def _clear_ca_env() -> None:
    for name in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"):
        os.environ.pop(name, None)


def test_ca_bundle_is_none_when_unset(tmp_path: Path) -> None:
    _clear_ca_env()
    try:
        assert config.ca_bundle_path() is None, "must not invent a bundle"
    finally:
        _clear_ca_env()


def test_ca_bundle_ignores_a_missing_file(tmp_path: Path) -> None:
    _clear_ca_env()
    os.environ["SSL_CERT_FILE"] = str(tmp_path / "nope.crt")
    try:
        assert config.ca_bundle_path() is None, "a bad path must fall back to normal verification"
    finally:
        _clear_ca_env()


def test_ca_bundle_order_ssl_cert_file_first(tmp_path: Path) -> None:
    bundle = tmp_path / "ca.crt"
    bundle.write_text("-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n")
    _clear_ca_env()
    os.environ["SSL_CERT_FILE"] = str(bundle)
    os.environ["REQUESTS_CA_BUNDLE"] = str(tmp_path / "other.crt")
    try:
        assert config.ca_bundle_path() == str(bundle)
    finally:
        _clear_ca_env()


def test_safe_fetch_verifies_against_the_configured_bundle(tmp_path: Path) -> None:
    import ssl
    import safe_fetch

    bundle = tmp_path / "ca.crt"
    bundle.write_text("-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n")
    _clear_ca_env()
    try:
        default_verify = safe_fetch._verify()
        assert default_verify is not False, "default must be real verification, never False"
        if isinstance(default_verify, ssl.SSLContext):
            assert default_verify.verify_mode == ssl.CERT_REQUIRED
        else:
            assert default_verify is True
        os.environ["SSL_CERT_FILE"] = str(bundle)
        assert safe_fetch._verify() == str(bundle)
    finally:
        _clear_ca_env()
