# 决策文件契约

决策文件是一个 JSON 对象：

```json
{
  "version": "v1",
  "batch_id": "<prepare.data.batch_id>",
  "baseline_hash": "<prepare.data.baseline_hash>",
  "decisions": [
    {
      "id": "<candidate.id>",
      "decision": "keep",
      "reason": "包含可复现的实现与测量",
      "display_title": "Agent 运行时基准",
      "display_summary": "发布了源码、测试方法与可复现结果。",
      "translated": true,
      "category": "agent-systems",
      "tags": ["agent", "benchmark"]
    },
    {
      "id": "<candidate.id>",
      "decision": "discard",
      "reason": "只有结论，没有来源或实现细节"
    }
  ]
}
```

`batch_id`、`baseline_hash` 和每个 `id` 必须原样复制。`decisions` 必须恰好覆盖批次中的所有候选，不能缺失、重复或增加 ID。

所有决定都必须包含 `id`、`decision` 和非空 `reason`。`keep` 还必须包含非空 `display_title`、`display_summary`、布尔值 `translated`、本批次允许的 `category`；`tags` 可省略，提供时必须是最多 8 个非空且不重复的字符串。`discard` 不得包含展示字段。
