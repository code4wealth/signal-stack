"""Unit tests for network diagnostics (net_diag), preflight integration, and 502 verdict hints."""

from __future__ import annotations

from fastapi.testclient import TestClient

import discovery
import main
import net_diag
import research


def test_net_diag_all_ok_and_env_flags_never_leak_values(monkeypatch) -> None:
    secret_cert = "/secret/custom/corp-root.pem"
    secret_proxy = "http://user:pass_secret@proxy.internal:8080"
    monkeypatch.setenv("SSL_CERT_FILE", secret_cert)
    monkeypatch.setenv("HTTPS_PROXY", secret_proxy)
    monkeypatch.delenv("HTTP_PROXY", raising=False)

    report = net_diag.diagnose_network(
        target_url="https://stripe.com",
        python_probe=lambda _url, _t: (True, 200, None, None),
        system_probe=lambda _url, _t: True,
    )

    assert report["verdict"] == "all-ok"
    assert report["ok"] is True
    assert report["env_flags"] == {
        "SSL_CERT_FILE": True,
        "HTTPS_PROXY": True,
        "HTTP_PROXY": False,
    }
    rendered = "\n".join(net_diag.format_report_lines(report))
    assert secret_cert not in rendered
    assert secret_proxy not in rendered
    assert "pass_secret" not in rendered
    assert "SSL_CERT_FILE=set, HTTPS_PROXY=set, HTTP_PROXY=unset" in rendered


def test_net_diag_verdict_all_hosts_fail() -> None:
    report = net_diag.diagnose_network(
        target_url="https://stripe.com",
        python_probe=lambda _url, _t: (False, None, "ConnectError", "TLS/SSL EOF"),
        system_probe=lambda _url, _t: False,
    )

    assert report["verdict"] == "all-hosts-fail"
    assert report["ok"] is False
    assert all(p["error_type"] == "ConnectError" for p in report["probes"])


def test_net_diag_verdict_only_host_fails() -> None:
    def probe(url: str, _t: float):
        if "api.groq.com" in url:
            return False, None, "ConnectTimeout", "timed out"
        return True, 200, None, None

    report = net_diag.diagnose_network(
        python_probe=probe,
        system_probe=lambda _url, _t: False,
    )

    assert report["verdict"] == "only-api.groq.com-fails"
    assert report["ok"] is False

    # Also test target URL failing alone
    def target_probe(url: str, _t: float):
        if "custom-target.example" in url:
            return False, None, "ReadTimeout", "timed out"
        return True, 200, None, None

    target_report = net_diag.diagnose_network(
        target_url="https://custom-target.example/news",
        python_probe=target_probe,
        system_probe=lambda _url, _t: False,
    )
    assert target_report["verdict"] == "only-custom-target.example-fails"


def test_net_diag_verdict_python_fails_but_system_works() -> None:
    report = net_diag.diagnose_network(
        python_probe=lambda _url, _t: (False, None, "SSLCertVerificationError", "self-signed cert"),
        system_probe=lambda _url, _t: True,
    )

    assert report["verdict"] == "python-fails-but-system-works"
    assert report["ok"] is False
    assert "SSL_CERT_FILE" in report["hint"]


def test_research_and_discovery_502_include_net_diag_hint(monkeypatch) -> None:
    monkeypatch.setattr(
        net_diag,
        "format_transport_hint",
        lambda *_a, **_k: "[net_diag: python-fails-but-system-works] Check SSL_CERT_FILE.",
    )

    with TestClient(main.app) as client:
        created = client.post(
            "/api/companies",
            json={"name": "TEST_DiagCo", "website": "https://public.test", "context": "TEST"},
        )
        assert created.status_code == 201
        company_id = created.json()["id"]

        monkeypatch.setattr(
            research,
            "research_company",
            lambda _db, _c: (_ for _ in ()).throw(
                research.ResearchError("Could not fetch any page from https://public.test: fetch: transport error")
            ),
        )
        res_research = client.post(f"/api/companies/{company_id}/research")
        assert res_research.status_code == 502
        assert "[net_diag: python-fails-but-system-works]" in res_research.json()["detail"]

        monkeypatch.setattr(
            discovery,
            "discover",
            lambda _db, _c: (_ for _ in ()).throw(
                discovery.DiscoveryError("transport error: ConnectError reaching api.groq.com")
            ),
        )
        res_discover = client.post(f"/api/companies/{company_id}/sources/discover")
        assert res_discover.status_code == 502
        assert "[net_diag: python-fails-but-system-works]" in res_discover.json()["detail"]
