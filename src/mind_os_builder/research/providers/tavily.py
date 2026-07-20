from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Callable

from mind_os_builder.research.http import JsonHttp, JsonHttpClient, ProviderHttpError
from mind_os_builder.research.models import (
    ProviderResult,
    ProviderStatus,
    ResearchMode,
    ResearchRequest,
)
from mind_os_builder.research.prompts import build_research_prompt, compact
from mind_os_builder.research.providers._shared import (
    credential,
    failed,
    object_list,
    skipped_for_key,
    text,
    unique_urls,
)


def _query(request: ResearchRequest) -> str:
    focus = f" {request.focus}" if request.focus else ""
    return (
        f"{request.topic}{focus} technical architecture implementation maturity "
        "best practices production readiness developer discussion"
    ).strip()


@dataclass(slots=True)
class TavilySearchProvider:
    key_env: str = "TAVILY_API_KEY"
    timeout: float = 90
    http: JsonHttp = field(default_factory=JsonHttpClient)
    name: str = "tavily-search"

    def run(self, request: ResearchRequest) -> ProviderResult:
        key = credential(self.key_env)
        if not key:
            return skipped_for_key(self.name, self.key_env)
        query = _query(request)
        data = self.http.post(
            "https://api.tavily.com/search",
            {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            {
                "query": query,
                "search_depth": (
                    "advanced"
                    if request.mode in {ResearchMode.STANDARD, ResearchMode.DEEP}
                    else "basic"
                ),
                "chunks_per_source": 3,
                "max_results": {
                    ResearchMode.QUICK: 5,
                    ResearchMode.STANDARD: 8,
                    ResearchMode.DEEP: 12,
                }[request.mode],
                "topic": "general",
                "include_answer": (
                    "advanced" if request.mode is ResearchMode.DEEP else "basic"
                ),
                "include_raw_content": (
                    "markdown" if request.mode is ResearchMode.DEEP else False
                ),
                "include_favicon": True,
                "include_usage": True,
            },
            self.timeout,
        )
        results = object_list(data.get("results"))
        lines = [
            f"查询：{text(data.get('query')) or query}",
            f"回答摘要：{text(data.get('answer')) or '无'}",
            f"返回结果数：{len(results)}",
            "",
        ]
        for index, item in enumerate(results, start=1):
            lines.extend(
                [
                    f"### {index}. {text(item.get('title')) or '无标题'}",
                    f"- URL：{text(item.get('url'))}",
                    f"- 相关度：{item.get('score', '未知')}",
                ]
            )
            published = text(item.get("published_date")) or text(
                item.get("publishedDate")
            )
            if published:
                lines.append(f"- 发布日期：{published}")
            content = text(item.get("content"))
            raw_content = text(item.get("raw_content"))
            if content:
                lines.extend(["- 摘要/片段：", compact(content, 1600)])
            if raw_content:
                lines.extend(["- 原始内容摘录：", compact(raw_content, 1800)])
            lines.append("")
        return ProviderResult(
            self.name,
            ProviderStatus.SUCCEEDED,
            "\n".join(lines).strip(),
            citations=unique_urls(item.get("url") for item in results),
            metadata={
                "request_id": data.get("request_id"),
                "usage": data.get("usage"),
            },
        )


@dataclass(slots=True)
class TavilyResearchProvider:
    key_env: str = "TAVILY_API_KEY"
    timeout: float = 90
    max_wait_seconds: float = 180
    poll_interval_seconds: float = 5
    http: JsonHttp = field(default_factory=JsonHttpClient)
    monotonic: Callable[[], float] = time.monotonic
    sleeper: Callable[[float], None] = time.sleep
    name: str = "tavily-research"

    def run(self, request: ResearchRequest) -> ProviderResult:
        key = credential(self.key_env)
        if not key:
            return skipped_for_key(self.name, self.key_env)
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        task = self.http.post(
            "https://api.tavily.com/research",
            headers,
            {
                "input": build_research_prompt(request),
                "model": {
                    ResearchMode.QUICK: "mini",
                    ResearchMode.STANDARD: "auto",
                    ResearchMode.DEEP: "pro",
                }[request.mode],
                "stream": False,
                "citation_format": "numbered",
                "output_length": {
                    ResearchMode.QUICK: "short",
                    ResearchMode.STANDARD: "standard",
                    ResearchMode.DEEP: "long",
                }[request.mode],
            },
            self.timeout,
        )
        request_id = text(task.get("request_id"))
        if not request_id:
            return failed(self.name, "invalid_response")
        task_status = text(task.get("status"))
        if task_status == "completed":
            return self._completed(request_id, task)
        if task_status == "failed":
            return failed(
                self.name,
                "research_failed",
                request_id=request_id,
                last_status=task_status,
            )
        deadline = self.monotonic() + self.max_wait_seconds
        last_status = task_status
        while (remaining := deadline - self.monotonic()) > 0:
            try:
                status = self.http.get(
                    f"https://api.tavily.com/research/{request_id}",
                    headers,
                    min(self.timeout, remaining),
                    deadline=deadline,
                )
            except ProviderHttpError:
                return failed(
                    self.name,
                    "provider_request_failed",
                    request_id=request_id,
                    last_status=last_status,
                )
            last_status = text(status.get("status"))
            if last_status == "completed":
                return self._completed(request_id, status)
            if last_status == "failed":
                return failed(
                    self.name,
                    "research_failed",
                    request_id=request_id,
                    last_status=last_status,
                )
            remaining = deadline - self.monotonic()
            if remaining > 0:
                self.sleeper(
                    min(max(1.0, self.poll_interval_seconds), remaining)
                )
        return failed(
            self.name,
            "research_timeout",
            request_id=request_id,
            last_status=last_status,
        )

    def _completed(self, request_id: str, status: dict[str, object]) -> ProviderResult:
        content = status.get("content")
        if isinstance(content, (dict, list)):
            rendered = json.dumps(content, ensure_ascii=False, indent=2)
        else:
            rendered = text(content)
        sources = object_list(status.get("sources"))
        lines = [rendered.strip(), "", "### Tavily Research Sources", ""]
        lines.extend(
            f"- {text(source.get('title')) or '无标题'}: {text(source.get('url'))}"
            for source in sources
        )
        return ProviderResult(
            self.name,
            ProviderStatus.SUCCEEDED,
            "\n".join(lines).strip(),
            citations=unique_urls(source.get("url") for source in sources),
            metadata={
                "request_id": request_id,
                "response_time": status.get("response_time"),
            },
        )
