"""Unit tests for llm.healthcheck and Groq error handling."""

from __future__ import annotations

import llm


def test_healthcheck_uses_reasoning_safe_max_tokens(monkeypatch) -> None:
    captured: dict = {}

    class _FakeChoice:
        class message:
            content = '{"status": "ok", "echo": "signal-stack"}'

    class _FakeResp:
        choices = [_FakeChoice()]

    class _FakeCompletions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return _FakeResp()

    class _FakeChat:
        completions = _FakeCompletions()

    class _FakeClient:
        chat = _FakeChat()

    monkeypatch.setattr(llm, "_get_client", lambda: _FakeClient())

    out = llm.healthcheck()
    assert out["status"] == "ok"
    assert out["echo"] == "signal-stack"
    assert captured["max_tokens"] >= 400
