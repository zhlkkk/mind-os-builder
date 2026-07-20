from __future__ import annotations

import os
from dataclasses import dataclass, field

from mind_os_builder.research.http import JsonHttp, JsonHttpClient
from mind_os_builder.research.models import ProviderResult, ProviderStatus, ResearchRequest
from mind_os_builder.research.prompts import (
    UNTRUSTED_CONTEXT_INSTRUCTION,
    build_google_prompt,
)
from mind_os_builder.research.providers._shared import (
    credential,
    object_list,
    skipped_for_key,
    text,
)


@dataclass(slots=True)
class GoogleProvider:
    key_env: str = "GOOGLE_AI_KEY"
    model: str = "gemini-2.5-pro"
    model_env: str = "TECH_RESEARCH_GOOGLE_MODEL"
    timeout: float = 90
    http: JsonHttp = field(default_factory=JsonHttpClient)
    name: str = "google"

    def run(self, request: ResearchRequest) -> ProviderResult:
        key = credential(self.key_env)
        if not key:
            return skipped_for_key(self.name, self.key_env)
        model = os.environ.get(self.model_env, self.model)
        data = self.http.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            {"Content-Type": "application/json", "x-goog-api-key": key},
            {
                "systemInstruction": {
                    "parts": [{"text": UNTRUSTED_CONTEXT_INSTRUCTION}],
                },
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": build_google_prompt(request)}],
                    }
                ],
                "generationConfig": {"temperature": 0.3},
            },
            self.timeout,
        )
        candidates = object_list(data.get("candidates"))
        content = candidates[0].get("content") if candidates else None
        parts = object_list(content.get("parts")) if isinstance(content, dict) else []
        message = "\n".join(text(part.get("text")) for part in parts).strip()
        return ProviderResult(
            self.name,
            ProviderStatus.SUCCEEDED,
            message,
            metadata={"model": model, "usage": data.get("usageMetadata")},
        )
