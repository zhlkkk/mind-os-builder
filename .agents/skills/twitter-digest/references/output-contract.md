# 输出与状态契约

`prepare` 把批次写入系统临时目录，不写 vault。批次由随机 `batch_id` 标识，并用 `baseline_hash` 绑定候选、游标、分类表和输出目录；调用方不得直接编辑批次文件。

`commit` 默认 dry-run。显式 `--apply` 后，它把保留项写入：

```text
<vault-root>/<collect.twitter.output_directory>/YYYY-MM-DD.md
```

每日文件按配置分类分组，每条记录包含稳定的候选 ID 标记。翻译项同时保留原文标题和原文摘录。被拒绝的候选不会进入简报，但会和保留项一起登记到 `.mindos/collect/seen.json`，防止后续批次反复要求 Agent 判断；Provider 游标写入 `.mindos/collect/cursors.json`。

`.mindos/collect/receipts.json` 只保存批次哈希、首次提交日期、阶段、目标和文件哈希，不保存候选正文。提交会校验决策完整性、分类合法性、批次基线、每日文件结构和重复 ID，并在 vault 级锁内完成。批次可重复提交；重试沿用首次日期，已经处理的候选不会重复写入。
