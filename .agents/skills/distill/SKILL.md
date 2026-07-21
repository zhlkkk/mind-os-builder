---
name: distill
description: 扫描日记中的角色标签，编排 Lumina、Prism、Vector、Nexus、Ember 生成回复，并通过确定性 CLI 安全提交。用户要提炼日记或处理角色标签时使用。
compatibility: 需要 Node.js 24+ 和 mindos CLI；角色回复由宿主 Agent 生成。
---

# Distill

CLI 只扫描、校验和提交；本 Skill 与 `agents/roles/` 负责角色选择和回复生成。角色不得直接编辑 vault。

1. 运行 `mindos distill scan <vault> <journals/file.md> --json`。`state: noop` 表示没有待处理标签；`state: needs_agent` 时保存 `data.baseline_hash` 与 `data.triggers`。
2. 按每个 trigger 的 `persona` 读取对应角色契约。不同 `concurrency_key` 可并行；相同 Ember 键必须串行。`book_slug` 和 Nexus 的 `mode` 只作为角色上下文。
3. 严格按 [回复契约](references/response-schema.md) 生成 JSON。每个 trigger 必须且只能有一项回复，不得添加路径或写入请求。
4. 运行 `mindos distill commit <vault> <journals/file.md> <responses.json> --json` 预演。若返回 `mindos.state.conflict`，停止并重新 scan，不尝试合并用户修改。
5. 用户确认后追加 `--apply`。成功后重新 scan 应为 `noop`；相同输入重放也应为 `noop`。

Callout 的观点、措辞和时间由角色生成；CLI 只验证角色头、每行 `>`、完整覆盖、来源基线和幂等 marker。
