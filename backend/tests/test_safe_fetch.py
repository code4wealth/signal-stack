"""SSRF, robots, retry, cap and conditional-GET tests for safe_fetch (Phase 1 gate)."""

from __future__ import annotations

import httpx
import pytest
import respx

import safe_fetch
from safe_fetch import BlockedURL, FetchFailed, RobotsDisallowed, fetch, validate_url


@pytest.fixture
def router():
    """Explicit respx router so route registration and mocking never diverge."""
    with respx.mock(assert_all_called=False) as mock_router:
        yield mock_router


# --------------------------------------------------------------------------- #
# AC7: SSRF - literal addresses that must always be refused
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://127.0.0.1:8000/admin",
        "http://10.0.0.1/",
        "http://10.255.255.1/internal",
        "http://169.254.169.254/latest/meta-data/",
        "http://192.168.0.10/",
        "http://172.16.5.4/",
        "http://[::1]/",
        "http://0.0.0.0/",
        "http://100.100.100.200/",
    ],
)
def test_blocks_private_and_metadata_literals(url: str) -> None:
    with pytest.raises(BlockedURL):
        validate_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://public.test/file.txt",
        "gopher://127.0.0.1:70/",
        "javascript:alert(1)",
        "data:text/html,<h1>x</h1>",
        "ws://public.test/socket",
        "",
    ],
)
def test_blocks_non_http_schemes(url: str) -> None:
    with pytest.raises(BlockedURL):
        validate_url(url)


def test_blocks_credentials_in_url(router) -> None:
    with pytest.raises(BlockedURL):
        validate_url("http://user:pass@public.test/")


def test_blocks_public_url_that_resolves_to_private_ip(router) -> None:
    with pytest.raises(BlockedURL):
        validate_url("http://internal.test/report")


def test_blocks_hostname_resolving_to_metadata_ip(router) -> None:
    with pytest.raises(BlockedURL):
        validate_url("http://metadata.test/")


def test_allows_normal_public_url(router) -> None:
    assert validate_url("http://public.test/about") == "http://public.test/about"


# --------------------------------------------------------------------------- #
# AC7: redirects must be re-validated per hop
# --------------------------------------------------------------------------- #
def test_redirect_to_private_ip_is_blocked(router) -> None:
    router.get("http://public.test/start").mock(
        return_value=httpx.Response(302, headers={"location": "http://127.0.0.1/secrets"})
    )
    private_route = router.get("http://127.0.0.1/secrets").mock(
        return_value=httpx.Response(200, text="should never be reached")
    )

    with pytest.raises(BlockedURL):
        fetch("http://public.test/start", respect_robots=False, max_attempts=1)

    assert not private_route.called, "the private hop must not be requested at all"


def test_redirect_to_public_ip_that_resolves_private_is_blocked(router) -> None:
    router.get("http://public.test/start").mock(
        return_value=httpx.Response(301, headers={"location": "http://internal.test/secret"})
    )
    internal_route = router.get("http://internal.test/secret").mock(
        return_value=httpx.Response(200, text="internal")
    )

    with pytest.raises(BlockedURL):
        fetch("http://public.test/start", respect_robots=False, max_attempts=1)

    assert not internal_route.called


def test_safe_redirect_chain_is_followed(router) -> None:
    router.get("http://public.test/a").mock(
        return_value=httpx.Response(302, headers={"location": "/b"})
    )
    router.get("http://public.test/b").mock(
        return_value=httpx.Response(307, headers={"location": "http://other.test/c"})
    )
    router.get("http://other.test/c").mock(return_value=httpx.Response(200, text="<html>final</html>"))

    result = fetch("http://public.test/a", respect_robots=False, max_attempts=1)

    assert result.ok and result.redirects == 2
    assert result.url == "http://other.test/c"
    assert "final" in result.text


def test_redirect_loop_cap(router) -> None:
    for i in range(8):
        router.get(f"http://public.test/hop{i}").mock(
            return_value=httpx.Response(302, headers={"location": f"/hop{i + 1}"})
        )
    with pytest.raises(FetchFailed, match="too many redirects"):
        fetch("http://public.test/hop0", respect_robots=False, max_attempts=1)


# --------------------------------------------------------------------------- #
# robots.txt
# --------------------------------------------------------------------------- #
def test_robots_disallow_blocks_request(router) -> None:
    router.get("http://public.test/robots.txt").mock(
        return_value=httpx.Response(200, text="User-agent: *\nDisallow: /private\n")
    )
    blocked = router.get("http://public.test/private/page").mock(return_value=httpx.Response(200, text="x"))

    with pytest.raises(RobotsDisallowed):
        fetch("http://public.test/private/page", max_attempts=1)

    assert not blocked.called


def test_robots_allow_lets_request_through(router) -> None:
    router.get("http://public.test/robots.txt").mock(
        return_value=httpx.Response(200, text="User-agent: *\nDisallow: /private\n")
    )
    router.get("http://public.test/blog").mock(return_value=httpx.Response(200, text="public page"))

    result = fetch("http://public.test/blog", max_attempts=1)
    assert result.ok and "public page" in result.text


def test_robots_missing_means_allowed(router) -> None:
    router.get("http://public.test/robots.txt").mock(return_value=httpx.Response(404))
    router.get("http://public.test/anything").mock(return_value=httpx.Response(200, text="ok"))

    assert fetch("http://public.test/anything", max_attempts=1).ok


def test_robots_is_cached_per_origin(router) -> None:
    robots = router.get("http://public.test/robots.txt").mock(
        return_value=httpx.Response(200, text="User-agent: *\nAllow: /\n")
    )
    router.get("http://public.test/one").mock(return_value=httpx.Response(200, text="1"))
    router.get("http://public.test/two").mock(return_value=httpx.Response(200, text="2"))

    fetch("http://public.test/one", max_attempts=1)
    fetch("http://public.test/two", max_attempts=1)

    assert robots.call_count == 1


# --------------------------------------------------------------------------- #
# Retries, caps, conditional GET
# --------------------------------------------------------------------------- #
def test_retries_on_500_then_succeeds(router, monkeypatch) -> None:
    monkeypatch.setattr(safe_fetch.time, "sleep", lambda _seconds: None)
    route = router.get("http://public.test/flaky").mock(
        side_effect=[httpx.Response(500), httpx.Response(503), httpx.Response(200, text="recovered")]
    )

    result = fetch("http://public.test/flaky", respect_robots=False, max_attempts=3)

    assert result.ok and result.attempts == 3 and "recovered" in result.text
    assert route.call_count == 3


def test_404_is_not_retried(router, monkeypatch) -> None:
    monkeypatch.setattr(safe_fetch.time, "sleep", lambda _seconds: None)
    route = router.get("http://public.test/missing").mock(return_value=httpx.Response(404))

    with pytest.raises(FetchFailed) as excinfo:
        fetch("http://public.test/missing", respect_robots=False, max_attempts=3)

    assert excinfo.value.status == 404
    assert route.call_count == 1


def test_response_size_cap(router, monkeypatch) -> None:
    monkeypatch.setattr(safe_fetch.time, "sleep", lambda _seconds: None)
    router.get("http://public.test/big").mock(
        return_value=httpx.Response(200, content=b"x" * 5000)
    )

    with pytest.raises(FetchFailed, match="larger than cap"):
        fetch("http://public.test/big", respect_robots=False, max_bytes=1000, max_attempts=1)


def test_conditional_get_returns_304(router) -> None:
    route = router.get("http://public.test/feed").mock(
        side_effect=[
            httpx.Response(200, text="version 1", headers={"etag": '"abc"'}),
            httpx.Response(304, headers={"etag": '"abc"'}),
        ]
    )

    first = fetch("http://public.test/feed", respect_robots=False, max_attempts=1)
    second = fetch("http://public.test/feed", respect_robots=False, max_attempts=1, etag=first.etag)

    assert first.etag == '"abc"'
    assert second.not_modified and second.status == 304
    assert route.calls[1].request.headers["if-none-match"] == '"abc"'


def test_last_modified_header_is_sent(router) -> None:
    route = router.get("http://public.test/page").mock(return_value=httpx.Response(304))
    fetch("http://public.test/page", respect_robots=False, max_attempts=1, last_modified="Wed, 01 Jan 2025 00:00:00 GMT")
    assert route.calls[0].request.headers["if-modified-since"] == "Wed, 01 Jan 2025 00:00:00 GMT"


def test_rate_limit_spaces_requests_per_host(router) -> None:
    safe_fetch.set_rate_limit_override(0.25)
    router.get("http://public.test/x").mock(return_value=httpx.Response(200, text="ok"))

    import time as real_time

    start = real_time.monotonic()
    fetch("http://public.test/x", respect_robots=False, max_attempts=1)
    fetch("http://public.test/x", respect_robots=False, max_attempts=1)
    elapsed = real_time.monotonic() - start

    assert elapsed >= 0.2, f"expected >=0.2s between same-host requests, got {elapsed:.3f}s"


def test_check_reachable_reports_failure_without_raising(router) -> None:
    router.get("http://public.test/robots.txt").mock(return_value=httpx.Response(404))
    router.get("http://public.test/dead").mock(side_effect=httpx.ConnectError("refused"))
    ok, detail = safe_fetch.check_reachable("http://public.test/dead")
    assert ok is False and "transport error" in detail


def test_remote_protocol_error_retries_with_connection_close(router, monkeypatch) -> None:
    monkeypatch.setattr(safe_fetch.time, "sleep", lambda _seconds: None)
    router.get("http://public.test/robots.txt").mock(return_value=httpx.Response(404))
    route = router.get("http://public.test/edge").mock(
        side_effect=[
            httpx.RemoteProtocolError("Server disconnected without sending a response."),
            httpx.Response(200, text="<html><body>recovered after close</body></html>"),
        ]
    )

    result = fetch("http://public.test/edge", max_attempts=3)

    assert result.ok and result.attempts == 2
    assert "recovered after close" in result.text
    assert route.calls[1].request.headers.get("connection") == "close"


def test_ssl_context_uses_truststore_or_env_ca_and_falls_back_to_certifi(monkeypatch, tmp_path) -> None:
    import ssl
    import sys
    import certifi
    import config

    monkeypatch.delenv("SSL_CERT_FILE", raising=False)
    monkeypatch.delenv("REQUESTS_CA_BUNDLE", raising=False)
    monkeypatch.delenv("CURL_CA_BUNDLE", raising=False)

    # 1. Default uses OS truststore when available
    assert config.ssl_trust_source() == "os-truststore"
    ctx = config.build_ssl_context()
    assert isinstance(ctx, ssl.SSLContext)

    # 2. Explicit SSL_CERT_FILE overrides truststore
    ca_file = tmp_path / "corp.pem"
    ca_file.write_text(open(certifi.where(), "r", encoding="utf-8").read(), encoding="utf-8")
    monkeypatch.setenv("SSL_CERT_FILE", str(ca_file))
    assert config.ssl_trust_source() == "env-ca-bundle"
    assert isinstance(config.build_ssl_context(), ssl.SSLContext)

    # 3. Missing truststore falls back cleanly to certifi
    monkeypatch.delenv("SSL_CERT_FILE", raising=False)
    monkeypatch.setitem(sys.modules, "truststore", None)
    assert config.ssl_trust_source() == "certifi"
    assert isinstance(config.build_ssl_context(), ssl.SSLContext)


def test_redirect_to_trickle_response_hits_wall_clock_deadline_and_logs(caplog) -> None:
    import logging
    import time as real_time

    class TrickleStream(httpx.SyncByteStream):
        def __iter__(self):
            for _ in range(100):
                real_time.sleep(0.05)
                yield b"x"

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url == httpx.URL("http://public.test/robots.txt"):
            return httpx.Response(404)
        if request.url == httpx.URL("http://public.test/start"):
            return httpx.Response(301, headers={"location": "https://other.test/slow"})
        if request.url == httpx.URL("https://other.test/robots.txt"):
            return httpx.Response(404)
        if request.url == httpx.URL("https://other.test/slow"):
            return httpx.Response(200, stream=TrickleStream(), headers={"content-type": "text/html"})
        raise AssertionError(f"unexpected request {request.url}")

    transport = httpx.MockTransport(handler)
    started = real_time.monotonic()
    with caplog.at_level(logging.INFO, logger="signalstack.safe_fetch"):
        with pytest.raises(safe_fetch.FetchDeadlineExceeded, match=r"Site did not respond within .*s: other\.test"):
            fetch(
                "http://public.test/start",
                timeout=5.0,
                total_timeout=0.25,
                max_attempts=3,
                transport=transport,
            )
    elapsed = real_time.monotonic() - started
    assert elapsed < 1.5, f"trickle fetch should abort near wall-clock deadline, took {elapsed:.2f}s"
    assert any(
        "safe_fetch redirect from=http://public.test/start to=https://other.test/slow status=301 hop=1" in r.message
        for r in caplog.records
    )


def test_redirect_and_retries_log_every_hop_and_attempt(monkeypatch, caplog) -> None:
    import logging

    monkeypatch.setattr(safe_fetch.time, "sleep", lambda _s: None)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if request.url == httpx.URL("http://public.test/redir"):
            return httpx.Response(301, headers={"location": "https://other.test/hang"})
        if request.url == httpx.URL("https://other.test/hang"):
            raise httpx.ReadTimeout("timed out", request=request)
        raise AssertionError(f"unexpected request {request.url}")

    transport = httpx.MockTransport(handler)
    with caplog.at_level(logging.INFO, logger="signalstack.safe_fetch"):
        with pytest.raises(FetchFailed):
            fetch(
                "http://public.test/redir",
                timeout=1.0,
                total_timeout=5.0,
                max_attempts=3,
                transport=transport,
            )

    redirect_logs = [r.message for r in caplog.records if "safe_fetch redirect " in r.message]
    retry_logs = [r.message for r in caplog.records if "safe_fetch retry " in r.message]
    assert len(redirect_logs) == 1
    assert "from=http://public.test/redir to=https://other.test/hang status=301 hop=1" in redirect_logs[0]
    assert len(retry_logs) == 3
    assert all("url=https://other.test/hang" in msg and "error=ReadTimeout" in msg for msg in retry_logs)


def test_403_uses_honest_user_agent_and_does_not_bypass(router, monkeypatch) -> None:
    monkeypatch.setattr(safe_fetch.time, "sleep", lambda _s: None)
    router.get("https://public.test/robots.txt").mock(return_value=httpx.Response(404))
    route = router.get("https://public.test/blocked").mock(
        return_value=httpx.Response(403, text="Forbidden")
    )

    with pytest.raises(FetchFailed, match=r"site blocked automated access") as excinfo:
        fetch("https://public.test/blocked", max_attempts=3)

    assert excinfo.value.status == 403
    assert route.call_count == 1
    sent_ua = route.calls[0].request.headers.get("user-agent", "")
    assert "SignalStackBot" in sent_ua
    assert "Mozilla/5.0" not in sent_ua


def test_safe_fetch_has_no_browser_impersonation_fallback() -> None:
    import inspect

    src = inspect.getsource(safe_fetch)
    assert "curl_cffi" not in src
    assert "_request_once_browser" not in src
    assert "Chrome/131" not in src



