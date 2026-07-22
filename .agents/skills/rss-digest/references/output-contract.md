# 输出与状态契约

`prepare` 每次读取 Folo articles 最新 50 条，只把去重后的候选、分类与基线写入当前用户的系统临时目录。临时批次按 vault 隔离、权限为 0700/0600，并在 24 小时后失效；不写 vault，不保存凭证。

`commit` 默认 preview。显式 `--apply` 后，保留项按分类写入：

```text
<vault-root>/<collect.rss.output_directory>/<collect.rss.daily_filename>
```

`daily_filename` 必须包含一个 `{date}` 占位符。提交器按配置顺序维护分类标题，在已有分类内追加新条目，并按稳定 ID 标记及来源 URL 去重。RSS 条目使用紧凑编号格式：加粗标题、一句摘要，以及订阅源名称链接和 `Folo entry` ID。提交器会把带 `mindos:collect:rss` 标记的旧详细块收敛为该格式，无标记的旧任务条目保持不变。已有 frontmatter 的 `entry_count` 与 `last_updated` 会随提交更新。所有候选都进入 `.mindos/collect/seen.json`；`.mindos/collect/receipts.json` 只保存批次哈希、首次日期、提交阶段和目标哈希，不保存候选正文。

同一批次重放使用首次提交日期并收敛为 `noop`。批次损坏、过期、跨 vault、基线变化、未知或缺失 ID、非法分类都会阻止提交；失败不会把内容写入第二个日期文件。
