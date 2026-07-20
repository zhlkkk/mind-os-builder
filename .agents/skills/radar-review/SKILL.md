---
name: radar-review
description: 审查技术雷达信号的日期、层级和建议动作。用户要发现到期、临近、缺字段或需要人工升级判断的条目时使用。
compatibility: 需要 Python 3.11+ 和可用的 mindos CLI；本地 dry-run 不需要网络。
---

# Radar Review

1. 运行 `mindos radar review <vault-root> --json`；需要固定输入时追加 `--page <page>`、`--hub <hub>` 或 `--today <YYYY-MM-DD>`；完成条件：`status` 为 `succeeded`、`reason_code` 为 `dry_run`，并取得 `metrics.active`、`near` 和 `actions`。
2. 逐项核对日期、当前层级、来源日期和建议动作；完成条件：`metrics.actions` 中每一项都被归类为确定性到期、证据驱动升级或信息不足。
3. 向用户呈现将写入的建议标记和目标页面，取得逐项确认后用相同命令追加 `--apply`；完成条件：`artifacts` 只包含已确认页面及 `wiki/log.md`，页面移动、归档和高判断升级仍交给人类。
4. 重复执行同一条 `--apply` 命令验证幂等；完成条件：`changed` 为 `false`、`reason_code` 为 `noop`，页面中没有重复建议标记。

调度器或 Agent Automation 只负责触发命令；公共工作流保持客户端中立。
