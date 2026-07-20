---
name: mind-os
description: 初始化、诊断或检查本地 Mind OS。用户要从空目录建立 LLM Wiki、确认运行依赖，或排查结构与链接错误时使用。
compatibility: 需要 Python 3.11+ 和可用的 mindos CLI；核心流程不需要网络。
---

# Mind OS

1. 运行 `mindos doctor --json` 并读取必需依赖；完成条件：`status` 为 `succeeded`，否则原样报告 `missing_requirement` 并停止当前分支。
2. 初始化分支先运行 `mindos wiki init <vault-root> --json`；完成条件：`status` 为 `succeeded`，`reason_code` 为 `dry_run` 或 `noop`，且所有 `artifacts` 都位于目标 vault。
3. 用户明确确认初始化写入后，用相同命令追加 `--apply`；完成条件：首次执行成功，重复执行返回 `changed: false` 和 `reason_code: noop`。
4. 初始化或检查分支运行 `mindos wiki lint <vault-root> --json`；完成条件：`status` 为 `succeeded` 且 `metrics.error_count` 为 `0`。

只以 JSON 中的 `status`、`reason_code`、`changed`、`artifacts` 和 `errors` 判断结果。文件访问必须限制在调用方声明的 vault 根目录内。
