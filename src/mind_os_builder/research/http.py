from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from http.client import HTTPMessage
from typing import IO
from typing import Any, Callable, Protocol


class ProviderHttpError(RuntimeError):
    pass


class JsonHttp(Protocol):
    def post(
        self,
        url: str,
        headers: dict[str, str],
        payload: dict[str, Any],
        timeout: float,
    ) -> dict[str, Any]: ...

    def get(
        self,
        url: str,
        headers: dict[str, str],
        timeout: float,
        *,
        deadline: float | None = None,
    ) -> dict[str, Any]: ...


def _origin(value: str) -> tuple[str, str, int]:
    parsed = urllib.parse.urlsplit(value)
    port = parsed.port
    if port is None:
        port = 80 if parsed.scheme.lower() == "http" else 443
    return parsed.scheme.lower(), (parsed.hostname or "").lower(), port


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: IO[bytes],
        code: int,
        msg: str,
        headers: HTTPMessage,
        newurl: str,
    ) -> urllib.request.Request | None:
        if _origin(req.full_url) != _origin(newurl):
            return None
        return super().redirect_request(req, fp, code, msg, headers, newurl)


@dataclass(slots=True)
class JsonHttpClient:
    attempts: int = 3
    retry_backoff_seconds: tuple[float, ...] = (1.5, 3.0)
    max_response_bytes: int = 10 * 1024 * 1024
    sleeper: Callable[[float], None] = time.sleep
    monotonic: Callable[[], float] = time.monotonic

    def post(
        self,
        url: str,
        headers: dict[str, str],
        payload: dict[str, Any],
        timeout: float,
    ) -> dict[str, Any]:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        return self._request("POST", url, headers, timeout, data)

    def get(
        self,
        url: str,
        headers: dict[str, str],
        timeout: float,
        *,
        deadline: float | None = None,
    ) -> dict[str, Any]:
        return self._request("GET", url, headers, timeout, None, deadline)

    def _request(
        self,
        method: str,
        url: str,
        headers: dict[str, str],
        timeout: float,
        data: bytes | None,
        deadline: float | None = None,
    ) -> dict[str, Any]:
        last_error: Exception | None = None
        opener = urllib.request.build_opener(_SafeRedirectHandler())
        attempts = self.attempts if method == "GET" else 1
        for attempt in range(attempts):
            request_timeout = timeout
            if deadline is not None:
                remaining = deadline - self.monotonic()
                if remaining <= 0:
                    break
                request_timeout = min(timeout, remaining)
            request = urllib.request.Request(
                url,
                data=data,
                headers=headers,
                method=method,
            )
            try:
                with opener.open(  # noqa: S310
                    request, timeout=request_timeout
                ) as response:
                    content_length = response.headers.get("Content-Length")
                    if (
                        content_length is not None
                        and int(content_length) > self.max_response_bytes
                    ):
                        raise ProviderHttpError("provider response too large")
                    body = response.read(self.max_response_bytes + 1)
                    if len(body) > self.max_response_bytes:
                        raise ProviderHttpError("provider response too large")
                    decoded = json.loads(body.decode("utf-8"))
                if not isinstance(decoded, dict):
                    raise ValueError("JSON response must be an object")
                return {str(key): value for key, value in decoded.items()}
            except ProviderHttpError:
                raise
            except urllib.error.HTTPError as exc:
                last_error = exc
                if exc.code != 429 and not 500 <= exc.code < 600:
                    break
                if not self._backoff(attempt, attempts, deadline):
                    break
            except (
                OSError,
                TimeoutError,
                ValueError,
                json.JSONDecodeError,
                urllib.error.URLError,
            ) as exc:
                last_error = exc
                if not self._backoff(attempt, attempts, deadline):
                    break
        raise ProviderHttpError("provider request failed") from last_error

    def _backoff(
        self,
        attempt: int,
        attempts: int,
        deadline: float | None,
    ) -> bool:
        if attempt >= attempts - 1:
            return False
        delay = self.retry_backoff_seconds[attempt]
        if deadline is not None:
            remaining = deadline - self.monotonic()
            if remaining <= 0:
                return False
            delay = min(delay, remaining)
        self.sleeper(delay)
        return deadline is None or self.monotonic() < deadline
