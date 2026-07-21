# 分类与标签提示词

## 输入

- 一个决定为 `keep` 的候选及展示摘要。
- `prepare.data.categories` 分类表。

## 任务

只从批次分类键中选择一个最符合主要价值的分类；无法稳定归类时使用 `other`。可生成最多 8 个简短、去重且不重复分类名的标签。

## 输出

```json
{"id":"<candidate.id>","category":"agent-systems","tags":["agent","benchmark"]}
```

## 硬约束

不得扩展分类表，也不得让某一候选改变输出目录或其他候选的分类。
