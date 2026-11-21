"""Network and TLS diagnostics for Signal Stack.

Tests outbound HTTPS connectivity to baseline hosts (example.com, www.google.com,
api.groq.com) plus an optional target URL, records per-host timing and exact
exception class names, inspects Python/OpenSSL/certifi and proxy/TLS env flags
(booleans only, never printing values), and emits a single actionable verdict:

  - all-ok
  - all-hosts-fail
  - only-<host>-fails
  - python-fails-but-system-works
"""

from __future__ import annotations

import os
import platform
import shutil
import ssl
import subprocess
import time
from dataclasses import asdict, dataclass
from typing import Any, Callable
from urllib.parse import urlparse

import certifi
import httpx

BASELINE_URLS: tuple[str, ...] = (
    "https://example.com/",
    "https://www.google.com/",
    "https://api.groq.com/",
)

ENV_FLAG_NAMES: tuple[str, ...] = (
    "SSL_CERT_FILE",
    "HTTPS_PROXY",
    "HTTP_PROXY",
)


@dataclass
class HostProbeResult:
    url: str
    host: str
    ok: bool
    status_code: int | None
    elapsed_ms: int
    error_type: str | None = None
    error_detail: str | None = None
    system_ok: bool | None = None


def _normalise_target_url(target_url: str) -> str:
    cleaned = target_url.strip()
    if not cleaned.lower().startswith(("http://", "https://")):
        cleaned = f"https://{cleaned}"
    return cleaned


def _host_of(url: str) -> str:
    return (urlparse(url).hostname or url).lower()


def collect_environment_info() -> dict[str, Any]:
    """Return runtime TLS/env metadata using boolean flags only (never env values)."""
    return {
        "python_version": platform.python_version(),
        "openssl_version": ssl.OPENSSL_VERSION,
        "certifi_path": certifi.where(),
        "env_flags": {name: bool(os.getenv(name, "").strip()) for name in ENV_FLAG_NAMES},
    }


def _default_python_probe(url: str, timeout: float) -> tuple[bool, int | None, str | None, str | None]:
    ca_path = os.getenv("SSL_CERT_FILE", "").strip()
    verify: str | bool = ca_path if ca_path and os.path.isfile(ca_path) else True
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True, verify=verify) as client:
            response = client.get(url)
        return True, response.status_code, None, None
    except Exception as exc:
        return False, None, exc.__class__.__name__, str(exc)[:240]


def _default_system_probe(url: str, timeout: float) -> bool | None:
    """Probe `url` using the OS HTTP/TLS stack (`curl.exe` / `curl`) rather than Python."""
    curl_bin = shutil.which("curl.exe") or shutil.which("curl")
    if not curl_bin:
        return None
    try:
        proc = subprocess.run(
            [curl_bin, "-I", "-sS", "-o", os.devnull, "--max-time", str(max(1, int(timeout))), url],
            capture_output=True,
            text=True,
            timeout=timeout + 2.0,
            check=False,
        )
        return proc.returncode == 0
    except Exception:
        return False


def _compute_verdict(
    results: list[HostProbeResult],
    *,
    target_host: str | None = None,
) -> tuple[str, str]:
    failed = [r for r in results if not r.ok]
    passed = [r for r in results if r.ok]

    if not failed:
        return "all-ok", "All baseline HTTPS probes succeeded from Python."

    if any(r.system_ok is True for r in failed):
        failing_hosts = ", ".join(dict.fromkeys(r.host for r in failed))
        return (
            "python-fails-but-system-works",
            f"Python TLS/HTTP failed for {failing_hosts}, but the OS network stack succeeded. "
            "Check SSL_CERT_FILE, certifi CA bundle, or corporate proxy/root CA configuration.",
        )

    if not passed:
        return (
            "all-hosts-fail",
            "All outbound HTTPS probes failed (example.com, www.google.com, api.groq.com). "
            "Check internet connectivity, firewall, VPN, or HTTPS_PROXY/HTTP_PROXY settings.",
        )

    failing_hosts = list(dict.fromkeys(r.host for r in failed))
    chosen_host = target_host if (target_host and target_host in failing_hosts) else failing_hosts[0]
    verdict = f"only-{chosen_host}-fails"
    return (
        verdict,
        f"Baseline HTTPS works, but {chosen_host} failed ({failed[0].error_type or 'transport error'}). "
        f"{chosen_host} may be unreachable, blocked, or rate-limiting from this network.",
    )


def diagnose_network(
    target_url: str | None = None,
    *,
    timeout: float = 8.0,
    python_probe: Callable[[str, float], tuple[bool, int | None, str | None, str | None]] | None = None,
    system_probe: Callable[[str, float], bool | None] | None = None,
) -> dict[str, Any]:
    """Run HTTPS diagnostics and return structured environment, probe, and verdict data."""
    py_probe = python_probe or _default_python_probe
    sys_probe = system_probe or _default_system_probe

    urls: list[str] = list(BASELINE_URLS)
    target_host: str | None = None
    if target_url and target_url.strip():
        norm_target = _normalise_target_url(target_url)
        target_host = _host_of(norm_target)
        if not any(_host_of(u) == target_host and urlparse(u).path == urlparse(norm_target).path for u in urls):
            urls.append(norm_target)

    results: list[HostProbeResult] = []
    for url in urls:
        host = _host_of(url)
        started = time.monotonic()
        ok, status_code, error_type, error_detail = py_probe(url, timeout)
        elapsed_ms = int((time.monotonic() - started) * 1000)
        system_ok: bool | None = None
        if not ok:
            system_ok = sys_probe(url, timeout)
        results.append(
            HostProbeResult(
                url=url,
                host=host,
                ok=ok,
                status_code=status_code,
                elapsed_ms=elapsed_ms,
                error_type=error_type,
                error_detail=error_detail,
                system_ok=system_ok,
            )
        )

    verdict, hint = _compute_verdict(results, target_host=target_host)
    env_info = collect_environment_info()
    return {
        **env_info,
        "target_url": _normalise_target_url(target_url) if target_url and target_url.strip() else None,
        "probes": [asdict(r) for r in results],
        "verdict": verdict,
        "hint": hint,
        "ok": verdict == "all-ok",
    }


def format_transport_hint(target_url: str | None = None, *, timeout: float = 3.0) -> str:
    """Run quick diagnostics after a transport error and return a concise hint string."""
    try:
        report = diagnose_network(target_url=target_url, timeout=timeout)
    except Exception as exc:
        return f"[net_diag: diagnostic-error] {exc.__class__.__name__}"
    return f"[net_diag: {report['verdict']}] {report['hint']}"


def format_report_lines(report: dict[str, Any]) -> list[str]:
    """Format diagnostic report as human-readable lines without any secret values."""
    flags = report.get("env_flags") or {}
    flag_summary = ", ".join(f"{k}={'set' if flags.get(k) else 'unset'}" for k in ENV_FLAG_NAMES)
    lines = [
        f"Python: {report['python_version']} | OpenSSL: {report['openssl_version']}",
        f"certifi: {report['certifi_path']}",
        f"Env flags: {flag_summary}",
        "HTTPS probes:",
    ]
    for probe in report.get("probes", []):
        if probe["ok"]:
            lines.append(f"  [PASS] {probe['url']} -> HTTP {probe['status_code']} ({probe['elapsed_ms']} ms)")
        else:
            sys_note = ""
            if probe.get("system_ok") is True:
                sys_note = " | system=PASS"
            elif probe.get("system_ok") is False:
                sys_note = " | system=FAIL"
            lines.append(
                f"  [FAIL] {probe['url']} -> {probe.get('error_type') or 'Error'} "
                f"({probe['elapsed_ms']} ms{sys_note}): {probe.get('error_detail') or ''}"
            )
    lines.append(f"Verdict: {report['verdict']}")
    lines.append(f"Hint: {report['hint']}")
    return lines
