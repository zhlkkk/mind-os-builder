from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from mind_os_builder.application.dispatcher import dispatch_action
from mind_os_builder.research.models import ResearchRequest
from mind_os_builder.research.providers.http_json import HttpJsonProvider


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


def _json_handler(received: list[str | None]) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            received.append(self.headers.get("Authorization"))
            length = int(self.headers.get("Content-Length", "0"))
            self.rfile.read(length)
            body = json.dumps({"content": "可信研究结果"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            return

    return Handler


def test_endpoint_override_does_not_receive_configured_token(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    received: list[str | None] = []
    monkeypatch.setenv("MINDOS_RESEARCH_ENDPOINT", "https://trusted.invalid/research")
    monkeypatch.setenv("MINDOS_RESEARCH_TOKEN", "secret-token")

    with _server(_json_handler(received)) as endpoint:
        result = dispatch_action(
            "research.run",
            tmp_path,
            {"topic": "MCP", "endpoint": f"{endpoint}/override"},
            False,
        )

    assert result.status.value == "succeeded"
    assert received == [None]


def test_cross_origin_redirect_drops_authorization(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    initial_received: list[str | None] = []
    redirected_received: list[str | None] = []
    monkeypatch.setenv("MINDOS_RESEARCH_TOKEN", "secret-token")

    class RedirectTarget(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            redirected_received.append(self.headers.get("Authorization"))
            body = json.dumps({"content": "重定向研究结果"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            return

    with _server(RedirectTarget) as target:

        class RedirectSource(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                initial_received.append(self.headers.get("Authorization"))
                length = int(self.headers.get("Content-Length", "0"))
                self.rfile.read(length)
                self.send_response(302)
                self.send_header("Location", f"{target}/result")
                self.end_headers()

            def log_message(self, format: str, *args: object) -> None:
                return

        with _server(RedirectSource) as endpoint:
            provider = HttpJsonProvider(
                endpoint=f"{endpoint}/research",
                trusted_endpoint=f"{endpoint}/research",
            )
            result = provider.run(ResearchRequest("MCP"))

    assert result.ok is True
    assert initial_received == ["Bearer secret-token"]
    assert redirected_received == [None]
