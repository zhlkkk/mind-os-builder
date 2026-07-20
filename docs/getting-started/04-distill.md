# 04 Distill：一个编排器与五个角色

Distill 的确定性核心扫描日记标签、生成稳定触发 ID、安排并发波次、验证角色输出并幂等追加。Lumina、Prism、Vector、Nexus、Ember 只负责判断与正文，不直接写文件。

## 前置条件

- vault 中有 `journals/*.md`。
- 了解五个标签：`#lumina`、`#prism`、`#vector`、`#nexus`、`#ember`。
- Agent 适配器可选；离线示例使用固定 fake 输出。

## 动作

复制合成日记并扫描：

```bash
cp examples/synthetic-vault/journals/demo.md ./my-mind-os/journals/demo.md
uv run mindos distill scan ./my-mind-os journals/demo.md --json
```

让 Agent 按扫描结果生成 `responses.json`。顶层必须包含扫描结果的 `baseline_hash` 和 `responses` 数组；每项只包含 `trigger_id`、`persona` 和规范 `callout`：

```json
{
  "baseline_hash": "从 scan.metrics.baseline_hash 原样复制",
  "responses": [
    {"trigger_id": "...", "persona": "lumina", "callout": "> [!quote] ..."}
  ]
}
```

先预演，再写入：

```bash
uv run mindos distill apply ./my-mind-os journals/demo.md responses.json --json
uv run mindos distill apply ./my-mind-os journals/demo.md responses.json --apply --json
```

可直接运行 `examples/offline_full_journey.py` 查看固定 fake 输出。不得让角色自行编辑 journal，也不得接受角色请求额外写入路径。

## 可见产物

- `journals/2026-07-20.md` 中每个合成段落下方出现对应角色 Callout。
- 每个回复带不可伪造的 `mindos:distill:<trigger_id>` 幂等标记。
- 同一 Ember 状态的触发串行，其他角色可位于同一并发波次。

## 排错

- 没有 trigger：检查标签是否位于正文段落，且该段落旁是否已有对应 Callout。
- `persona mismatch`：角色输出与触发分发不一致。
- `trigger paragraph changed`：扫描后用户修改了原段落；重新扫描，不要覆盖用户修改。
- 输出请求其他文件写入：核心会拒绝；Nexus 的调研结果应走独立 Research Action。

## 完成检查

```bash
grep -c 'mindos:distill:' my-mind-os/journals/demo.md
```

离线示例应输出 `5`。再次应用同一批输出时文件内容不应变化。
