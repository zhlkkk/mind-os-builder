# Radar 决策契约

```json
{
  "version": "v1",
  "batch_id": "<prepare.data.batch_id>",
  "baseline_hash": "<prepare.data.baseline_hash>",
  "decisions": [
    {
      "suggestion_id": "<prepare.data.suggestions[n].suggestion_id>",
      "decision": "approve"
    }
  ]
}
```

- `decisions` 必须完整覆盖本批建议；每个 ID 只能出现一次。
- `decision` 只能是 `approve` 或 `reject`。
- 决策不能携带页面、marker、替代动作或其他字段；提交目标来自受保护的临时批次。
- JSON Schema 的规范副本是 `contracts/radar-decisions.schema.json`。
