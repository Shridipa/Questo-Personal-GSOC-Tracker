"""HTTP utilities shared by the external-data services (GitHub, GSoC catalog).

All external hosts are hard-coded server side. We never fetch arbitrary
user-supplied URLs, which rules out the SSRF family of attacks by construction.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 15.0
LARGE_PAYLOAD_TIMEOUT_SECONDS = 40.0
_MAX_ATTEMPTS = 3

_shared_client: httpx.Client | None = None


class ExternalSourceError(Exception):
    """Raised when an external data source fails or returns unusable data."""

    def __init__(self, message: str, status: int = 503):
        super().__init__(message)
        self.status = status


class RateLimitError(ExternalSourceError):
    def __init__(self, message: str, retry_after_seconds: int | None = None):
        super().__init__(message, status=429)
        self.retry_after_seconds = retry_after_seconds


def get_shared_client() -> httpx.Client:
    """Lazily create one pooled client for the whole process.

    FastAPI runs sync endpoints on the threadpool; httpx.Client is safe to
    share across threads for concurrent requests.
    """
    global _shared_client  # noqa: PLW0603
    if _shared_client is None:
        _shared_client = httpx.Client(
            timeout=DEFAULT_TIMEOUT_SECONDS,
            headers={"User-Agent": "Questo/0.3 (+https://questo.vercel.app)"},
            follow_redirects=False,
        )
    return _shared_client


def close_shared_client() -> None:
    global _shared_client  # noqa: PLW0603
    if _shared_client is not None:
        _shared_client.close()
        _shared_client = None


def get_json(
    client: httpx.Client,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
    large: bool = False,
) -> Any:
    """GET a JSON document with retries, backoff, timeout and rate-limit handling.

    `large=True` uses the longer timeout (multi-MB dataset files).
    Raises ExternalSourceError subclasses on failure; never partial data.
    """
    timeout = httpx.Timeout(LARGE_PAYLOAD_TIMEOUT_SECONDS if large else DEFAULT_TIMEOUT_SECONDS)
    last_error: str = "unknown error"
    for attempt in range(_MAX_ATTEMPTS):
        try:
            response = client.get(url, headers=headers, params=params, timeout=timeout)
        except httpx.HTTPError as error:
            last_error = f"network error: {error}"
            if attempt < _MAX_ATTEMPTS - 1:
                time.sleep(0.5 * (attempt + 1))
                continue
            break

        if response.status_code == 403:
            remaining = response.headers.get("X-RateLimit-Remaining")
            if remaining == "0" or response.headers.get("X-RateLimit-Reset"):
                reset = response.headers.get("X-RateLimit-Reset")
                wait: int | None = None
                if reset is not None:
                    try:
                        wait = max(0, int(float(reset)) - int(time.time()))
                    except ValueError:
                        wait = None
                raise RateLimitError(
                    "External API rate limit reached. Please try again later.",
                    retry_after_seconds=wait,
                )

        if response.status_code == 404:
            raise ExternalSourceError("The requested resource no longer exists upstream.", 404)

        if response.status_code in (500, 502, 503, 504):
            last_error = f"upstream server error: HTTP {response.status_code}"
            if attempt < _MAX_ATTEMPTS - 1:
                time.sleep(0.6 * (attempt + 1))
                continue
            break

        if response.status_code != 200:
            raise ExternalSourceError(
                f"External source returned HTTP {response.status_code}.", response.status_code
            )

        try:
            return response.json()
        except ValueError as error:
            raise ExternalSourceError(
                "External source returned invalid JSON.", response.status_code
            ) from error

    raise ExternalSourceError(f"External source unreachable ({last_error}).", 503)
