from __future__ import annotations

import json
import os
import urllib.request
from dataclasses import dataclass

from mind_os_builder.research.models import ProviderResult, ResearchRequest


@dataclass(slots=True)
class HttpJsonProvider:
    endpoint: str
    token_env: str = "MINDOS_RESEARCH_TOKEN"
    name: str = "http-json"
    capabilities: frozenset[str] = frozenset({"search"})
    timeout: float = 60.0

    def run(self, request: ResearchRequest) -> ProviderResult:
        payload = json.dumps(
            {"topic": request.topic, "focus": request.focus, "mode": request.mode.value}
        ).encode()
        headers = {"Content-Type": "application/json"}
        token = os.getenv(self.token_env)
        if token:
            headers["Authorization"] = f"Bearer {token}"
        call = urllib.request.Request(self.endpoint, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(call, timeout=self.timeout) as response:  # noqa: S310
            body = json.loads(response.read().decode("utf-8"))
        return ProviderResult(
            self.name,
            True,
            str(body.get("content", "")),
            citations=[str(item) for item in body.get("citations", [])],
            metadata={"endpoint": self.endpoint},
        )
