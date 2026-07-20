---
name: mind-os
description: 初始化、诊断和检查本地 Mind OS。用于从空目录建立 LLM Wiki、确认运行依赖，或执行结构与链接检查。
compatibility: 需要 Python 3.11+ 和可用的 mindos CLI；核心流程不需要网络。
---

# Mind OS

1. 先运行 `mindos doctor --json`，读取结构化状态和缺失能力。
2. 对新目录运行 `mindos wiki init <vault-root> --json`，检查预演结果。
3. 只有用户明确确认写入时，追加 `--apply` 再运行初始化。
4. 运行 `mindos wiki lint <vault-root> --json`，修复阻塞错误后再继续扩展模块。

始终把 JSON 中的 `status`、`reason_code`、`changed`、`artifacts` 和 `errors` 作为判断依据。不要把自然语言输出当作稳定接口，也不要读取或写入声明的 vault 之外。
