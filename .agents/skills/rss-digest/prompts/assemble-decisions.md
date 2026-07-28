# 决策组装提示词

## 输入

- `prepare.data` 中的批次字段、候选与分类表。
- 每个候选的筛选结果，以及保留项的摘要与分类结果。

## 任务

把模块结果合并成一个提交文件。`decisions` 必须恰好覆盖所有候选；`discard` 只含 `id`、`decision`、`reason`，`keep` 合并全部展示字段。组装前检查：不得出现短标题与摘要完全相同，不得在 10 条以上批次中全部保留且理由完全相同。

## 输出

只输出符合[决策文件契约](../references/decision-schema.md)的 JSON，不添加 Markdown 围栏、解释或额外字段。

## 硬约束

`version: "v1"`、`batch_id`、`baseline_hash` 和每个 `id` 必须原样复制。不得直接写 vault、批次、游标或已处理状态。
