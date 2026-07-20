from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from http.client import HTTPMessage
from typing import IO

from mind_os_builder.research.models import ProviderResult, ResearchRequest


def _normalized_url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value)
    scheme = parsed.scheme.lower()
    hostname = (parsed.hostname or "").lower()
    port = parsed.port
    if port is not None and not (
        (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    ):
        hostname = f"{hostname}:{port}"
    return urllib.parse.urlunsplit(
        (scheme, hostname, parsed.path or "/", parsed.query, "")
    )


def _origin(value: str) -> tuple[str, str, int | None]:
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
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None and _origin(req.full_url) != _origin(newurl):
            redirected.remove_header("Authorization")
        return redirected


@dataclass(slots=True)
class HttpJsonProvider:
    endpoint: str
    token_env: str = "MINDOS_RESEARCH_TOKEN"
    name: str = "http-json"
    capabilities: frozenset[str] = frozenset({"search"})
    timeout: float = 60.0
    trusted_endpoint: str | None = None

    def run(self, request: ResearchRequest) -> ProviderResult:
        payload = json.dumps(
            {"topic": request.topic, "focus": request.focus, "mode": request.mode.value}
        ).encode()
        headers = {"Content-Type": "application/json"}
        token = os.getenv(self.token_env)
        if (
            token
            and self.trusted_endpoint is not None
            and _normalized_url(self.endpoint) == _normalized_url(self.trusted_endpoint)
        ):
            headers["Authorization"] = f"Bearer {token}"
        call = urllib.request.Request(self.endpoint, data=payload, headers=headers, method="POST")
        opener = urllib.request.build_opener(_SafeRedirectHandler())
        with opener.open(call, timeout=self.timeout) as response:  # noqa: S310
            body = json.loads(response.read().decode("utf-8"))
        return ProviderResult(
            self.name,
            True,
            str(body.get("content", "")),
            citations=[str(item) for item in body.get("citations", [])],
            metadata={"endpoint": self.endpoint},
        )
