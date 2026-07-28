# 决策文件契约

```json
{
  "version": "v1",
  "batch_id": "<prepare.data.batch_id>",
  "baseline_hash": "<prepare.data.baseline_hash>",
  "decisions": [
    {
      "id": "entry-1",
      "decision": "keep",
      "reason": "包含一手实现",
      "display_title": "可复现的 Agent 基准",
      "display_summary": "作者公开了测试方法、代码与结果。",
      "translated": true,
      "category": "agent-systems",
      "tags": ["agent", "benchmark"]
    },
    {"id": "entry-2", "decision": "discard", "reason": "没有信息增量"}
  ]
}
```

决定必须完整覆盖批次候选且 ID 不重不漏。所有决定必需 `id`、`decision`、`reason`；`keep` 必需展示标题、摘要、`translated` 和合法分类，标签最多 8 个且不重复；`discard` 不得包含展示字段。

提交器还会阻止明显的机械决策：40 字以内的标题和摘要不得完全相同；候选达到 10 条时，不得全部保留且使用同一个理由。
