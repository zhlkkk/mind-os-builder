from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from mind_os_builder.application.dispatcher import dispatch_action
from mind_os_builder.research.http import JsonHttpClient, ProviderHttpError


@contextmanager
def _server(handler: type[BaseHTTPRequestHandler]) -> Iterator[str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    try:
        yield f"http://{host}:{port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_dispatcher_uses_real_providers_and_fails_closed_without_keys(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for name in (
        "TAVILY_API_KEY",
        "EXA_API_KEY",
        "PERPLEXITY_API_KEY",
        "OPENROUTER_KEY",
        "GOOGLE_AI_KEY",
    ):
        monkeypatch.delenv(name, raising=False)

    result = dispatch_action(
        "research.run",
        tmp_path,
        {"topic": "MCP", "mode": "standard", "providers": "auto"},
        True,
    )

    assert result.status.value == "failed"
    assert result.reason_code == "providers_unavailable"
    assert result.metrics["providers_skipped"] == 5
    assert not (tmp_path / "raw/research").exists()


def test_http_client_retries_with_configured_backoff() -> None:
    calls = 0

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            nonlocal calls
            calls += 1
            if calls < 3:
                body = b'{"error":"synthetic-secret"}'
                self.send_response(503)
            else:
                body = json.dumps({"content": "成功"}).encode()
                self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            del format, args

    waits: list[float] = []
    with _server(Handler) as endpoint:
        result = JsonHttpClient(sleeper=waits.append).get(endpoint, {}, 2)

    assert result == {"content": "成功"}
    assert calls == 3
    assert waits == [1.5, 3.0]


def test_http_client_does_not_retry_post_on_server_error() -> None:
    calls = 0

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            nonlocal calls
            calls += 1
            length = int(self.headers.get("Content-Length", "0"))
            self.rfile.read(length)
            body = b'{"error":"synthetic-secret"}'
            self.send_response(503)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            del format, args

    waits: list[float] = []
    with _server(Handler) as endpoint:
        with pytest.raises(ProviderHttpError) as captured:
            JsonHttpClient(sleeper=waits.append).post(
                endpoint,
                {"Content-Type": "application/json"},
                {"topic": "MCP"},
                2,
            )

    assert str(captured.value) == "provider request failed"
    assert "synthetic-secret" not in str(captured.value)
    assert calls == 1
    assert waits == []


def test_http_client_does_not_retry_non_rate_limit_client_error() -> None:
    calls = 0

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            nonlocal calls
            calls += 1
            body = b'{"error":"synthetic-secret"}'
            self.send_response(401)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            del format, args

    waits: list[float] = []
    with _server(Handler) as endpoint:
        with pytest.raises(ProviderHttpError) as captured:
            JsonHttpClient(sleeper=waits.append).get(endpoint, {}, 2)

    assert str(captured.value) == "provider request failed"
    assert "synthetic-secret" not in str(captured.value)
    assert calls == 1
    assert waits == []


def test_cross_origin_redirect_is_rejected_without_contacting_target() -> None:
    received: list[str] = []

    class Target(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            received.append(self.path)
            body = b'{"content":"ok"}'
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            del format, args

    with _server(Target) as target:

        class Source(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802
                length = int(self.headers.get("Content-Length", "0"))
                self.rfile.read(length)
                self.send_response(302)
                self.send_header("Location", target)
                self.end_headers()

            def log_message(self, format: str, *args: object) -> None:
                del format, args

        with _server(Source) as source:
            with pytest.raises(ProviderHttpError) as captured:
                JsonHttpClient().post(
                    source,
                    {
                        "Authorization": "Bearer synthetic-secret",
                        "x-api-key": "synthetic-secret",
                        "x-goog-api-key": "synthetic-secret",
                    },
                    {"topic": "MCP"},
                    2,
                )

    assert str(captured.value) == "provider request failed"
    assert "synthetic-secret" not in str(captured.value)
    assert received == []


def test_http_client_deadline_clips_backoff_and_stops_retries() -> None:
    calls = 0

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            nonlocal calls
            calls += 1
            body = b'{"error":"unavailable"}'
            self.send_response(503)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            del format, args

    now = 0.0
    waits: list[float] = []

    def sleep(seconds: float) -> None:
        nonlocal now
        waits.append(seconds)
        now += seconds

    with _server(Handler) as endpoint:
        with pytest.raises(ProviderHttpError):
            JsonHttpClient(
                attempts=3,
                retry_backoff_seconds=(1.5, 3.0),
                sleeper=sleep,
                monotonic=lambda: now,
            ).get(endpoint, {}, 10, deadline=2.0)

    assert calls == 2
    assert waits == [1.5, 0.5]


def test_http_client_rejects_oversized_response() -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            body = b'{"content":"too large"}'
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            del format, args

    with _server(Handler) as endpoint:
        with pytest.raises(ProviderHttpError, match="too large"):
            JsonHttpClient(
                attempts=1,
                retry_backoff_seconds=(),
                max_response_bytes=8,
            ).get(endpoint, {}, 2)
