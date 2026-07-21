---
name: mind-os
description: 初始化、诊断或检查本地 Mind OS。用户要从空目录建立 LLM Wiki、确认运行依赖，或排查结构与链接错误时使用。
compatibility: 需要 Node.js 24 和可用的 mindos CLI；核心流程不需要网络。
---

# Mind OS

1. 运行 `mindos doctor --json`；完成条件：确认 `data.node.supported`、`data.platform.certified`，并把当前任务需要但不可用的外部依赖交给用户处理，不自动安装或认证。
2. 初始化分支运行 `mindos wiki init <vault-root> --json`；完成条件：结果为 `preview` 或 `noop`，且 `artifacts` 全部位于目标 vault。
3. 只有用户确认预演后，才用相同命令追加 `--apply`；完成条件：首次结果为 `applied`，重复执行为 `noop`。
4. 需要 Book Base 时，依次预演并确认 `mindos books init <vault-root> --json` 与 `--apply`；完成条件：用户已有同名内容不被覆盖。
5. 运行 `mindos wiki lint <vault-root> --json`；启用 Books 时再运行 `mindos books validate <vault-root> --json`。完成条件：两个结果中的 `data.error_count` 或 `data.issue_count` 均为 `0`。

只按 v1 JSON 的 `ok`、`state`、`changed`、`artifacts`、`data` 和 `error` 判断结果。文件访问限制在调用方声明的 vault 根目录内。
