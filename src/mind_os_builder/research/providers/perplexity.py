from __future__ import annotations

import os
from dataclasses import dataclass, field

from mind_os_builder.research.http import JsonHttp, JsonHttpClient
from mind_os_builder.research.models import (
    ProviderResult,
    ProviderStatus,
    ResearchMode,
    ResearchRequest,
)
from mind_os_builder.research.prompts import build_research_prompt
from mind_os_builder.research.providers._shared import (
    credential,
    object_list,
    skipped_for_key,
    text,
    unique_urls,
)


@dataclass(slots=True)
class PerplexityProvider:
    key_env: str = "PERPLEXITY_API_KEY"
    model: str = "sonar-pro"
    deep_model: str = "sonar-deep-research"
    model_env: str = "TECH_RESEARCH_PERPLEXITY_MODEL"
    timeout: float = 90
    http: JsonHttp = field(default_factory=JsonHttpClient)
    name: str = "perplexity"

    def run(self, request: ResearchRequest) -> ProviderResult:
        key = credential(self.key_env)
        if not key:
            return skipped_for_key(self.name, self.key_env)
        default_model = self.deep_model if request.mode is ResearchMode.DEEP else self.model
        model = os.environ.get(self.model_env, default_model)
        payload: dict[str, object] = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "你是严谨的技术调研分析师，请输出带来源线索的中文笔记。",
                },
                {"role": "user", "content": build_research_prompt(request)},
            ],
        }
        if request.mode is ResearchMode.QUICK:
            payload["search_recency_filter"] = "month"
        elif request.mode is ResearchMode.DEEP:
            payload["search_recency_filter"] = "year"
        data = self.http.post(
            "https://api.perplexity.ai/v1/sonar",
            {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            payload,
            self.timeout,
        )
        choices = object_list(data.get("choices"))
        message = choices[0].get("message") if choices else None
        content = text(message.get("content")) if isinstance(message, dict) else ""
        direct_citations = data.get("citations")
        citation_values = direct_citations if isinstance(direct_citations, list) else []
        search_results = object_list(data.get("search_results"))
        citations = unique_urls(
            [*citation_values, *(item.get("url") for item in search_results)]
        )
        lines = [content]
        if search_results:
            lines.extend(["", "### Perplexity Search Results", ""])
            for item in search_results:
                lines.extend(
                    [
                        f"- {text(item.get('title')) or '无标题'}",
                        f"  - URL：{text(item.get('url'))}",
                        f"  - 发布日期：{text(item.get('date')) or '未知日期'}",
                        f"  - 摘录：{text(item.get('snippet')) or '无'}",
                    ]
                )
        return ProviderResult(
            self.name,
            ProviderStatus.SUCCEEDED,
            "\n".join(lines).strip(),
            citations=citations,
            metadata={"model": model, "usage": data.get("usage")},
        )
