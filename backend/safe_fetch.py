"""The only module in this project allowed to make outbound HTTP requests.

Responsibilities (PRD section 10):
  * scheme allow-list (http/https only), no embedded credentials
  * SSRF protection: resolve DNS, block private / loopback / link-local /
    reserved / multicast / unspecified / cloud-metadata addresses
  * manual redirect following with full re-validation of *every* hop
  * robots.txt compliance (cached, RFC 9309-ish semantics)
  * per-host rate limit (default 1 req/s)
  * hard timeout and response size cap
  * retries with exponential backoff for 429/5xx/transport errors
  * conditional GET (ETag / If-Modified-Since) -> 304 handling

Known gap (documented): DNS rebinding between the resolution check and the
TCP connect is not defended against; we re-resolve and re-check on every hop,
which narrows but does not eliminate the window.
"""

from __future__ import annotations

import ipaddress
import random
import socket
import threading
import time
import urllib.robotparser
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import httpx

from config import ca_bundle_path, get_settings

settings = get_settings()

ALLOWED_SCHEMES = {"http", "https"}
MAX_REDIRECTS = 5
DEFAULT_MAX_ATTEMPTS = 3
ROBOTS_TTL_SECONDS = 3600.0
REDIRECT_STATUSES = {301, 302, 303, 307, 308}

# Explicit metadata endpoints (defence in depth: also covered by the ranges below).
BLOCKED_HOSTS = {
    "169.254.169.254",  # AWS/GCP/Azure metadata
    "169.254.170.2",  # ECS task metadata
    "100.100.100.200",  # Alibaba Cloud metadata
    "metadata.google.internal",
    "metadata",
}

_blocked_networks = [
    ipaddress.ip_network(n)
    for n in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.0.0.0/24",
        "192.0.2.0/24",
        "192.168.0.0/16",
        "198.18.0.0/15",
        "198.51.100.0/24",
        "203.0.113.0/24",
        "224.0.0.0/4",
        "240.0.0.0/4",
        "::1/128",
        "::/128",
        "fc00::/7",
        "fe80::/10",
        "ff00::/8",
        "2001:db8::/32",
    )
]


class FetchError(Exception):
    """Typed failure. `kind` is stable and is what gets stored on the source."""

    kind = "fetch"

    def __init__(self, message: str, url: str = "", status: int | None = None):
        super().__init__(message)
        self.message = message
        self.url = url
        self.status = status

    def as_detail(self) -> str:
        return f"{self.kind}: {self.message}"[:500]


class BlockedURL(FetchError):
    kind = "blocked"


class RobotsDisallowed(FetchError):
    kind = "robots"


class FetchFailed(FetchError):
    kind = "fetch"


@dataclass
class FetchResult:
    url: str
    status: int
    text: str
    content: bytes
    content_type: str | None = None
    etag: str | None = None
    last_modified: str | None = None
    not_modified: bool = False
    attempts: int = 1
    elapsed_ms: int = 0
    redirects: int = 0

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300


# --------------------------------------------------------------------------- #
# SSRF guards
# --------------------------------------------------------------------------- #
def dns_resolve(host: str) -> list[str]:
    """Resolve a hostname to all A/AAAA addresses. Tests monkeypatch this."""
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise BlockedURL(f"DNS resolution failed for {host!r}: {exc}", url=host) from exc
    addresses: list[str] = []
    for info in infos:
        addr = info[4][0]
        if addr not in addresses:
            addresses.append(addr)
    if not addresses:
        raise BlockedURL(f"no addresses resolved for {host!r}", url=host)
    return addresses


def ip_is_blocked(ip: str) -> bool:
    """True if the literal IP must never be contacted."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped
    if (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    ):
        return True
    return any(addr in net for net in _blocked_networks)


def validate_url(url: str) -> str:
    """Validate scheme/host/credentials and every resolved address.

    Returns the normalised URL. Raises BlockedURL otherwise.
    """
    if not isinstance(url, str) or not url.strip():
        raise BlockedURL("empty url", url=str(url))
    parsed = urlparse(url.strip())
    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise BlockedURL(f"scheme {parsed.scheme!r} not allowed (http/https only)", url=url)
    if parsed.username or parsed.password:
        raise BlockedURL("credentials in URL are not allowed", url=url)
    host = (parsed.hostname or "").strip().lower()
    if not host:
        raise BlockedURL("url has no host", url=url)
    if host in BLOCKED_HOSTS:
        raise BlockedURL(f"host {host!r} is a metadata endpoint", url=url)
    try:
        port = parsed.port
    except ValueError as exc:
        raise BlockedURL(f"invalid port in url: {exc}", url=url) from exc
    if port is not None and not (0 < port < 65536):
        raise BlockedURL(f"invalid port {port}", url=url)

    # Literal IPs are checked directly; hostnames are resolved then checked.
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    addresses = [str(literal)] if literal is not None else dns_resolve(host)
    for address in addresses:
        if ip_is_blocked(address):
            raise BlockedURL(
                f"host {host!r} resolves to blocked address {address}", url=url
            )
    return url.strip()


def is_url_safe(url: str) -> bool:
    try:
        validate_url(url)
        return True
    except FetchError:
        return False


# --------------------------------------------------------------------------- #
# Rate limiting (per host, module-wide)
# --------------------------------------------------------------------------- #
_rate_lock = threading.Lock()
_last_request_at: dict[str, float] = {}
_rate_limit_seconds_override: float | None = None


def set_rate_limit_override(seconds: float | None) -> None:
    """Test helper: force the per-host interval (None restores config)."""
    global _rate_limit_seconds_override
    _rate_limit_seconds_override = seconds


def _per_host_interval() -> float:
    if _rate_limit_seconds_override is not None:
        return _rate_limit_seconds_override
    return 1.0 / max(1, settings.fetch_requests_per_second)


def _wait_for_host(host: str) -> None:
    interval = _per_host_interval()
    while True:
        with _rate_lock:
            now = time.monotonic()
            last = _last_request_at.get(host, 0.0)
            remaining = last + interval - now
            if remaining <= 0:
                _last_request_at[host] = now
                return
        time.sleep(min(remaining, 1.0))


# --------------------------------------------------------------------------- #
# robots.txt
# --------------------------------------------------------------------------- #
_robots_lock = threading.Lock()
_robots_cache: dict[str, tuple[float, urllib.robotparser.RobotFileParser | None]] = {}


def _robots_for(origin: str) -> urllib.robotparser.RobotFileParser | None:
    """Fetch+parse robots.txt once per origin. None means 'no rules -> allow'."""
    now = time.monotonic()
    with _robots_lock:
        cached = _robots_cache.get(origin)
        if cached and now - cached[0] < ROBOTS_TTL_SECONDS:
            return cached[1]

    parser: urllib.robotparser.RobotFileParser | None = None
    robots_url = origin + "/robots.txt"
    try:
        response = _raw_get(robots_url, timeout=min(10.0, float(settings.fetch_timeout_seconds)))
        if response.status_code == 200:
            parser = urllib.robotparser.RobotFileParser()
            parser.parse(response.text.splitlines())
            # urllib's parser is permissive about a missing User-agent block;
            # fall back to '*' explicitly so a named bot is honoured when listed.
            if not parser.default_entry and not parser.entries:
                parser = None
        elif 500 <= response.status_code < 600:
            # RFC 9309: 5xx means "treat as disallow all".
            parser = urllib.robotparser.RobotFileParser()
            parser.parse(["User-agent: *", "Disallow: /"])
        else:
            parser = None
    except (httpx.HTTPError, FetchError, ValueError):
        parser = None  # unreachable robots.txt -> allow (documented)

    with _robots_lock:
        _robots_cache[origin] = (time.monotonic(), parser)
    return parser


def robots_allows(url: str, user_agent: str | None = None) -> bool:
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    parser = _robots_for(origin)
    if parser is None:
        return True
    ua = user_agent or settings.user_agent
    return parser.can_fetch(ua, url)


def _raw_get(url: str, timeout: float) -> httpx.Response:
    with _client(timeout=timeout) as client:
        return client.get(url)


# --------------------------------------------------------------------------- #
# HTTP plumbing
# --------------------------------------------------------------------------- #
def _verify():
    """CA bundle from the environment when one is configured; True keeps httpx's default check."""

    return ca_bundle_path() or True


def _client(timeout: float) -> httpx.Client:
    return httpx.Client(
        timeout=timeout,
        follow_redirects=False,
        headers={"User-Agent": settings.user_agent, "Accept-Encoding": "gzip, deflate"},
        trust_env=False,
        verify=_verify(),
    )


def _decode(content: bytes, content_type: str | None) -> str:
    charset = "utf-8"
    if content_type and "charset=" in content_type:
        charset = content_type.split("charset=")[-1].split(";")[0].strip().strip('"') or "utf-8"
    for candidate in (charset, "utf-8", "latin-1"):
        try:
            return content.decode(candidate, errors="strict")
        except (UnicodeDecodeError, LookupError):
            continue
    return content.decode("utf-8", errors="replace")


def _is_textual(content_type: str | None) -> bool:
    if not content_type:
        return True
    ct = content_type.lower()
    return any(
        marker in ct
        for marker in ("text/", "html", "xml", "json", "rss", "atom", "javascript")
    )


def _request_once(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    timeout: float,
    max_bytes: int,
) -> tuple[int, dict[str, str], bytes]:
    with _client(timeout=timeout) as client:
        with client.stream(method, url, headers=headers) as response:
            chunks: list[bytes] = []
            size = 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > max_bytes:
                    raise FetchFailed(
                        f"response larger than cap ({max_bytes} bytes)", url=url, status=response.status_code
                    )
                chunks.append(chunk)
            return response.status_code, dict(response.headers), b"".join(chunks)


def _send_with_retries(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    timeout: float,
    max_bytes: int,
    max_attempts: int,
) -> tuple[int, dict[str, str], bytes, int]:
    last_error: FetchError | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            status, resp_headers, body = _request_once(
                method, url, headers=headers, timeout=timeout, max_bytes=max_bytes
            )
        except (httpx.TimeoutException,) as exc:
            last_error = FetchFailed(f"timeout after {timeout}s: {exc.__class__.__name__}", url=url)
        except httpx.HTTPError as exc:
            last_error = FetchFailed(f"transport error: {exc.__class__.__name__}: {exc}", url=url)
        except FetchFailed:
            raise
        else:
            if status == 429 or 500 <= status < 600:
                last_error = FetchFailed(f"http {status}", url=url, status=status)
            else:
                return status, resp_headers, body, attempt
        if attempt < max_attempts:
            backoff = (0.5 * (2 ** (attempt - 1))) + random.uniform(0, 0.25)
            time.sleep(backoff)
    assert last_error is not None
    raise last_error


def fetch(
    url: str,
    *,
    method: str = "GET",
    etag: str | None = None,
    last_modified: str | None = None,
    respect_robots: bool = True,
    timeout: float | None = None,
    max_bytes: int | None = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    extra_headers: dict[str, str] | None = None,
) -> FetchResult:
    """Fetch a URL safely. Raises BlockedURL / RobotsDisallowed / FetchFailed."""
    started = time.monotonic()
    timeout = float(timeout if timeout is not None else settings.fetch_timeout_seconds)
    max_bytes = int(max_bytes if max_bytes is not None else settings.fetch_max_bytes)

    current_url = validate_url(url)
    redirects = 0
    attempts_total = 0
    conditional_used = False

    while True:
        parsed = urlparse(current_url)
        host = (parsed.hostname or "").lower()

        if respect_robots and not robots_allows(current_url):
            raise RobotsDisallowed(f"robots.txt disallows {current_url}", url=current_url)

        _wait_for_host(host)

        headers: dict[str, str] = {"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}
        if extra_headers:
            headers.update(extra_headers)
        if not conditional_used and (etag or last_modified):
            if etag:
                headers["If-None-Match"] = etag
            if last_modified:
                headers["If-Modified-Since"] = last_modified
            conditional_used = True

        status, resp_headers, body, attempts = _send_with_retries(
            method,
            current_url,
            headers=headers,
            timeout=timeout,
            max_bytes=max_bytes,
            max_attempts=max_attempts,
        )
        attempts_total += attempts

        if status == 304:
            return FetchResult(
                url=current_url,
                status=304,
                text="",
                content=b"",
                content_type=resp_headers.get("content-type"),
                etag=resp_headers.get("etag"),
                last_modified=resp_headers.get("last-modified"),
                not_modified=True,
                attempts=attempts_total,
                elapsed_ms=int((time.monotonic() - started) * 1000),
                redirects=redirects,
            )

        if status in REDIRECT_STATUSES:
            location = resp_headers.get("location")
            if not location:
                raise FetchFailed(f"http {status} without Location header", url=current_url, status=status)
            if redirects >= MAX_REDIRECTS:
                raise FetchFailed(f"too many redirects (>{MAX_REDIRECTS})", url=current_url, status=status)
            next_url = urljoin(current_url, location)
            # Re-validate the hop *before* following it (scheme + DNS + IPs).
            current_url = validate_url(next_url)
            redirects += 1
            if status == 303:
                method = "GET"
            continue

        if 200 <= status < 300:
            content_type = resp_headers.get("content-type")
            text = _decode(body, content_type) if _is_textual(content_type) else ""
            return FetchResult(
                url=current_url,
                status=status,
                text=text,
                content=body,
                content_type=content_type,
                etag=resp_headers.get("etag"),
                last_modified=resp_headers.get("last-modified"),
                attempts=attempts_total,
                elapsed_ms=int((time.monotonic() - started) * 1000),
                redirects=redirects,
            )

        raise FetchFailed(f"http {status}", url=current_url, status=status)


def check_reachable(url: str) -> tuple[bool, str]:
    """Verification helper for source discovery: does this URL really exist?

    Returns (ok, detail). Never raises for network/SSRF problems - the caller
    stores the detail on the source so failures are visible, not silent.
    """
    try:
        result = fetch(url, method="GET")
    except FetchError as exc:
        return False, exc.as_detail()
    if not result.ok:
        return False, f"http {result.status}"
    return True, f"http {result.status}"
