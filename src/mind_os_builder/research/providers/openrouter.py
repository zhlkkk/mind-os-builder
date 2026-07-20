from __future__ import annotations

import os
from dataclasses import dataclass, field

from mind_os_builder.research.http import JsonHttp, JsonHttpClient
from mind_os_builder.research.models import ProviderResult, ProviderStatus, ResearchRequest
from mind_os_builder.research.prompts import (
    UNTRUSTED_CONTEXT_INSTRUCTION,
    build_openrouter_prompt,
)
from mind_os_builder.research.providers._shared import (
    credential,
    object_list,
    skipped_for_key,
    text,
)


@dataclass(slots=True)
class OpenRouterProvider:
    key_env: str = "OPENROUTER_KEY"
    model: str = "x-ai/grok-4.3"
    model_env: str = "TECH_RESEARCH_OPENROUTER_MODEL"
    timeout: float = 90
    http: JsonHttp = field(default_factory=JsonHttpClient)
    name: str = "openrouter"

    def run(self, request: ResearchRequest) -> ProviderResult:
        key = credential(self.key_env)
        if not key:
            return skipped_for_key(self.name, self.key_env)
        model = os.environ.get(self.model_env, self.model)
        data = self.http.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://mindos.local/tech-research",
                "X-OpenRouter-Title": "Mind OS Builder Tech Research",
            },
            {
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "你是带怀疑精神的技术分析师，请使用简体中文输出。"
                            f"{UNTRUSTED_CONTEXT_INSTRUCTION}"
                        ),
                    },
                    {"role": "user", "content": build_openrouter_prompt(request)},
                ],
            },
            self.timeout,
        )
        choices = object_list(data.get("choices"))
        message = choices[0].get("message") if choices else None
        content = text(message.get("content")) if isinstance(message, dict) else ""
        return ProviderResult(
            self.name,
            ProviderStatus.SUCCEEDED,
            content,
            metadata={"model": model, "usage": data.get("usage")},
        )
