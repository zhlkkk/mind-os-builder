from __future__ import annotations

from dataclasses import dataclass, field

from mind_os_builder.research.http import JsonHttp, JsonHttpClient
from mind_os_builder.research.models import (
    ProviderResult,
    ProviderStatus,
    ResearchMode,
    ResearchRequest,
)
from mind_os_builder.research.prompts import compact
from mind_os_builder.research.providers._shared import (
    credential,
    object_list,
    skipped_for_key,
    text,
    unique_urls,
)


@dataclass(slots=True)
class ExaProvider:
    key_env: str = "EXA_API_KEY"
    timeout: float = 90
    http: JsonHttp = field(default_factory=JsonHttpClient)
    name: str = "exa"

    def run(self, request: ResearchRequest) -> ProviderResult:
        key = credential(self.key_env)
        if not key:
            return skipped_for_key(self.name, self.key_env)
        query = (
            f"{request.topic} {request.focus} technical architecture maturity best practices "
            "GitHub docs discussion"
        ).strip()
        data = self.http.post(
            "https://api.exa.ai/search",
            {"x-api-key": key, "Content-Type": "application/json"},
            {
                "query": query,
                "type": "auto",
                "numResults": {
                    ResearchMode.QUICK: 5,
                    ResearchMode.STANDARD: 8,
                    ResearchMode.DEEP: 12,
                }[request.mode],
                "contents": {
                    "highlights": {"query": query, "maxCharacters": 1200},
                    "text": {
                        "maxCharacters": {
                            ResearchMode.QUICK: 1200,
                            ResearchMode.STANDARD: 2200,
                            ResearchMode.DEEP: 4000,
                        }[request.mode]
                    },
                },
            },
            self.timeout,
        )
        results = object_list(data.get("results"))
        lines = [f"查询：{query}", f"返回结果数：{len(results)}", ""]
        for index, item in enumerate(results, start=1):
            lines.extend(
                [
                    f"### {index}. {text(item.get('title')) or '无标题'}",
                    f"- URL：{text(item.get('url')) or text(item.get('id'))}",
                    f"- 发布日期：{text(item.get('publishedDate')) or '未知日期'}",
                ]
            )
            author = text(item.get("author"))
            if author:
                lines.append(f"- 作者/来源：{author}")
            highlights = [item for item in item.get("highlights", []) if isinstance(item, str)]
            page_text = text(item.get("text"))
            if highlights:
                lines.append("- 相关摘录：")
                lines.extend(f"  - {highlight}" for highlight in highlights[:4])
            elif page_text:
                lines.extend(["- 页面文本摘录：", compact(page_text, 1200)])
            lines.append("")
        return ProviderResult(
            self.name,
            ProviderStatus.SUCCEEDED,
            "\n".join(lines).strip(),
            citations=unique_urls(
                text(item.get("url")) or text(item.get("id")) for item in results
            ),
            metadata={"request_id": data.get("requestId"), "query": query},
        )
