from __future__ import annotations

import json
from datetime import date

from mind_os_builder.research.models import ProviderResult, ProviderStatus, ResearchRequest


def render_report(request: ResearchRequest, results: list[ProviderResult]) -> str:
    today = date.today().isoformat()
    source_count = sum(len(result.citations) for result in results if result.ok)
    lines = [
        "---",
        "domain: ai-and-llm",
        f"sources: {source_count}",
        f"created: {today}",
        f"updated: {today}",
        "tags: [tech-research, generated-draft]",
        "---",
        f"# 技术调研：{request.topic}",
        "",
        f"- 模式：{request.mode.value}",
        f"- 重点：{request.focus or '通用技术评估'}",
        "",
        "> 本报告包含 Provider 返回的模型草稿，不等于已验证事实；引用需要逐条核查。",
        "",
        "## Provider 状态",
        "",
    ]
    for result in results:
        if result.status is ProviderStatus.SUCCEEDED:
            status = "成功"
        elif result.status is ProviderStatus.SKIPPED:
            status = f"跳过（{result.error or 'unknown'}）"
        else:
            status = f"失败（{result.error or 'unknown'}）"
        model = result.metadata.get("model")
        if isinstance(model, str) and model:
            status += f"，模型 {model}"
        request_id = result.metadata.get("request_id")
        if isinstance(request_id, str) and request_id:
            status += f"，request_id {request_id}"
        last_status = result.metadata.get("last_status")
        if isinstance(last_status, str) and last_status:
            status += f"，最后状态 {last_status}"
        lines.append(f"- {result.name}: {status}")
    for result in results:
        if not result.ok:
            continue
        lines.extend(["", f"## {result.name} 证据草稿", "", result.content.strip() or "无内容。"])
        if result.citations:
            lines.extend(["", "### 引用", ""])
            lines.extend(f"- {citation}" for citation in result.citations)
        usage = result.metadata.get("usage")
        if usage is not None:
            lines.extend(
                [
                    "",
                    "### 用量元数据",
                    "",
                    f"`{json.dumps(usage, ensure_ascii=False, sort_keys=True)}`",
                ]
            )
    failures = [result for result in results if not result.ok]
    if failures:
        lines.extend(["", "## 未覆盖缺口", ""])
        lines.extend(f"- {result.name}: {result.error or 'unknown'}" for result in failures)
    lines.extend(["", "## 最终判断", "", "待人类核查证据后补充。", ""])
    return "\n".join(lines)
