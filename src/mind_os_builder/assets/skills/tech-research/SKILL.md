---
name: tech-research
description: 运行可审计的技术调研并区分证据、Provider 草稿和失败缺口。用于调研、比较、选型或评估技术、协议、模型与工具。
compatibility: 需要 Python 3.11+ 和可用的 mindos CLI；联网或付费 Provider 必须由用户显式授权并通过环境配置凭证。
---

# Tech Research

1. 明确主题、研究模式、比较维度和时效边界。
2. 运行 `mindos research run <vault-root> --topic <topic> --mode <mode> --json` 预演。
3. 检查 JSON 中的 Provider 成功数、失败缺口、引用和候选产物；不要把模型草稿直接当成事实。
4. 涉及网络、付费调用或写入时，分别取得用户明确授权。
5. 只有报告通过引用检查后，追加 `--apply` 提升到 vault；恢复运行时复用已完成结果，避免重复付费调用。

凭证只能来自环境或系统凭证机制，不得写入参数、报告、日志或对话输出。
