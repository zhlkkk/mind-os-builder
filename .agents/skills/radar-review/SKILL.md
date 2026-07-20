---
name: radar-review
description: 根据结构化日期和分级规则审查技术雷达信号。用于发现到期、缺字段或需要人工升级判断的条目，并生成可复核报告。
compatibility: 需要 Python 3.11+ 和可用的 mindos CLI；本地 dry-run 不需要网络。
---

# Radar Review

1. 运行 `mindos radar review <vault-root> --json` 生成只读审查报告。
2. 检查日期字段、当前层级、建议动作和缺失信息，区分确定性到期与需要人工判断的升级。
3. 默认只报告，不物理移动页面，也不自动执行高判断升级或归档。
4. 只有用户逐项确认允许的打标变更后，才追加 `--apply`。
5. 提交后再次运行 dry-run，确认没有意外重复变更。

调度器或 Agent Automation 只负责触发命令；不要把任何客户端调度语法写进公共工作流。
