"""Tests for scripts/preflight.py: verifies PASS/FAIL checks and ensures secrets never leak."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import httpx
import respx

PREFLIGHT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "preflight.py"
spec = importlib.util.spec_from_file_location("preflight", PREFLIGHT_PATH)
assert spec and spec.loader
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


def test_preflight_passes_and_never_exposes_secret(tmp_path: Path, monkeypatch) -> None:
    secret = "gsk_super_secret_test_value_12345"
    (tmp_path / ".env").write_text(
        f"GROQ_API_KEY={secret}\nGROQ_MODEL=llama-3.3-70b-versatile\nDATABASE_URL=sqlite:///test.db\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("GROQ_API_KEY", secret)

    with respx.mock(assert_all_called=True) as mock:
        mock.get("http://127.0.0.1:8000/api/health").respond(
            200,
            json={"status": "ok", "database": {"ok": True}, "llm": {"model": "llama-3.3-70b-versatile"}},
        )
        mock.get("http://127.0.0.1:8000/api/companies?limit=50").respond(
            200,
            json={"items": [], "total": 0},
        )
        mock.get("http://127.0.0.1:8000/api/llm/healthcheck").respond(
            200,
            json={"status": "ok", "model": "llama-3.3-70b-versatile"},
        )
        mock.get("http://127.0.0.1:3000").respond(200, text="<html>ok</html>")
        mock.get("https://example.com/").respond(200, text="<html>Example Domain</html>")

        results = preflight.run_preflight(root_dir=tmp_path)

    assert len(results) == 7
    assert all(passed for _, passed, _ in results), results
    joined = "\n".join(detail for _, _, detail in results)
    assert secret not in joined
    assert "gsk_" not in joined


def test_preflight_reports_failures_loudly(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with respx.mock() as mock:
        mock.get("http://127.0.0.1:8000/api/health").mock(side_effect=httpx.ConnectError("refused"))
        mock.get("http://127.0.0.1:3000").mock(side_effect=httpx.ConnectError("refused"))
        mock.get("https://example.com/").mock(side_effect=httpx.ConnectError("no egress"))

        results = preflight.run_preflight(root_dir=tmp_path)

    by_name = {name: passed for name, passed, _ in results}
    assert by_name["env_and_groq_key"] is False
    assert by_name["backend_health"] is False
    assert by_name["llm_healthcheck"] is False
    assert by_name["frontend_reachable"] is False
    assert by_name["public_egress"] is False
