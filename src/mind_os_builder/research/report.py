from __future__ import annotations

from datetime import date

from mind_os_builder.research.models import ProviderResult, ResearchRequest


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
        status = "成功" if result.ok else f"失败（{result.error or 'unknown'}）"
        lines.append(f"- {result.name}: {status}")
    for result in results:
        if not result.ok:
            continue
        lines.extend(["", f"## {result.name} 证据草稿", "", result.content.strip() or "无内容。"])
        if result.citations:
            lines.extend(["", "### 引用", ""])
            lines.extend(f"- {citation}" for citation in result.citations)
    failures = [result for result in results if not result.ok]
    if failures:
        lines.extend(["", "## 未覆盖缺口", ""])
        lines.extend(f"- {result.name}: {result.error or 'unknown'}" for result in failures)
    lines.extend(["", "## 最终判断", "", "待人类核查证据后补充。", ""])
    return "\n".join(lines)
