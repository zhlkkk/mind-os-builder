---
name: distill
description: 蒸馏日记中的角色标签并编排五类 Callout。用户要扫描待提炼段落、生成 Lumina、Prism、Vector、Nexus、Ember 回复，或安全追加结果时使用。
compatibility: 需要 Python 3.11+ 和可用的 mindos CLI；生成角色回复需要调用方自选的 Agent 或模型能力。
---

# Distill

1. 运行 `mindos distill scan <vault-root> <source> --json`；完成条件：已保存 `metrics.baseline_hash` 和全部 `metrics.triggers`，`metrics.trigger_count: 0` 时以 `noop` 结束。
2. 按中立角色契约为每个 trigger 生成一个 Callout：安装副本读取本 Skill 的 `references/roles/`，源码仓库读取根目录的 `agents/roles/`；完成条件：每个输出的 `trigger_id` 与 `persona` 原样匹配扫描结果，且 Callout 通过对应角色格式约束。
3. 按下方契约生成 `responses.json`；完成条件：顶层 `baseline_hash` 原样来自本次扫描，`responses` 恰好覆盖本次要处理的 trigger，没有额外字段或文件操作请求。
4. 运行 `mindos distill apply <vault-root> <source> <responses.json> --json` 预演；完成条件：`status` 为 `succeeded`、`reason_code` 为 `dry_run` 或 `noop`，且 planned、skipped trigger 均能与输入对应。
5. 用户确认预演后，用相同命令追加 `--apply`；完成条件：再次扫描得到 `trigger_count: 0`，重复应用同一响应返回 `changed: false` 和 `reason_code: noop`。

## `responses.json` 契约

```json
{
  "baseline_hash": "<scan.metrics.baseline_hash>",
  "responses": [
    {"trigger_id": "<id>", "persona": "<persona>", "callout": "<符合角色契约的 Callout>"}
  ]
}
```

角色输出仅包含 Callout 文本；路径校验、幂等、加锁和文件追加始终交给确定性核心。
