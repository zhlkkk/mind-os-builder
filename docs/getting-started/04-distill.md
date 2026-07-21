# 04 Distill：一个编排器与五个角色

Distill 按 `scan → Agent 角色回复 → commit` 工作。CLI 只扫描日记、验证完整回复、检查来源基线并幂等追加；Lumina、Prism、Vector、Nexus、Ember 负责判断与正文，不能直接写 vault。

## 前置条件

- 已安装 Node.js 24+ 与 `mindos`。
- vault 中存在 `journals/*.md`。
- 日记使用 `#lumina`、`#prism`、`#vector`、`#nexus`、`#ember` 或 `#book/<slug>` 标签。

## 扫描与生成回复

```bash
mindos distill scan ./my-mind-os journals/2026-07-21.md --json
```

有待处理标签时结果为 `state: needs_agent`。把 `data.triggers` 交给对应角色：不同 `concurrency_key` 可以并行，相同 Ember 键串行。角色按 `.agents/skills/distill/references/response-schema.md` 生成 `responses.json`，其中基线必须原样取自 `data.baseline_hash`。

```json
{
  "version": "v1",
  "baseline_hash": "从 scan.data.baseline_hash 原样复制",
  "responses": [
    {
      "trigger_id": "distill:v1:...",
      "persona": "lumina",
      "callout": "> [!quote] 🌿 Lumina (10:20)\n> 一段合成回复。"
    }
  ]
}
```

## 预演与提交

```bash
mindos distill commit ./my-mind-os journals/2026-07-21.md responses.json --json
mindos distill commit ./my-mind-os journals/2026-07-21.md responses.json --apply --json
```

第一条命令不写 vault。第二条只有在回复完整、persona 匹配、Callout 合法且日记仍符合扫描基线时才写入。重复提交同一文件返回 `noop`，不会重复 Callout。

## 安全边界与排错

- `mindos.input.invalid`：缺回复、未知 trigger、persona 不匹配、非法 Callout 或额外字段；修正同一响应文件。
- `mindos.state.conflict`：scan 后日记发生变化；重新 scan 并让角色基于新内容回复，不要自动合并。
- `mindos.state.locked`：另一个提交正在处理同一 vault；稍后用相同输入重试。
- 只接受 vault 内的 `journals/*.md`，不接受绝对路径、遍历路径、符号链接或任何角色请求的额外写入。

提交后再次运行 scan 应返回 `state: noop`。每个已提交回复都包含 CLI 生成的 `mindos:distill:<trigger_id>` marker；角色不得自行生成 marker。
