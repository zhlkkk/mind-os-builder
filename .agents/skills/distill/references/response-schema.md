# Distill 回复契约

```json
{
  "version": "v1",
  "baseline_hash": "<scan.data.baseline_hash>",
  "responses": [
    {
      "trigger_id": "<scan.data.triggers[n].trigger_id>",
      "persona": "lumina",
      "callout": "> [!quote] 🌿 Lumina (10:20)\n> 回复正文。"
    }
  ]
}
```

- `responses` 必须完整覆盖本次 scan 的 trigger，不能缺失、重复或包含未知 ID。
- `persona` 必须与 trigger 一致，可选值为 `lumina`、`prism`、`vector`、`nexus`、`ember`。
- Callout 第一行必须符合对应角色契约，且每一行以 `>` 开头。
- 不得生成 `mindos:distill:` marker，不得添加文件路径、写入请求或额外字段。
- JSON Schema 的规范副本是 `contracts/distill-responses.schema.json`。
