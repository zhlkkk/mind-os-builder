# 决策组装提示词

## 输入

- `prepare.data.batch_id`、`baseline_hash`、`candidates` 和 `categories`。
- 每个候选的筛选结果。
- 每个保留候选的翻译摘要与分类结果。

## 任务

把各模块结果合并成一个提交文件。`decisions` 必须恰好覆盖全部候选：不能缺失、重复或增加 `id`。拒绝项只保留 `id`、`decision: "discard"` 和非空 `reason`；保留项使用 `decision: "keep"` 并合并所有展示字段。组装前检查：不得保留裸 `t.co` 短链，不得出现短标题与摘要完全相同，不得在 10 条以上批次中全部保留且理由完全相同。

## 输出

只输出符合[决策文件契约](../references/decision-schema.md)的 JSON 对象，不添加 Markdown 围栏、解释文字或额外字段。

## 硬约束

`version: "v1"`、`batch_id`、`baseline_hash` 和每个 `id` 必须原样复制。不得直接写 vault、批次文件、游标或已处理状态；提交只能交给 `mindos collect twitter commit`。
