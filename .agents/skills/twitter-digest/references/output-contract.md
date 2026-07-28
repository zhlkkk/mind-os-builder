# 输出与状态契约

`prepare` 顺序抓取 OpenCLI 的 For You 与 Following 时间线各 50 条，按稳定 ID 合并后把批次写入系统临时目录，不写 vault。批次由随机 `batch_id` 标识，并用 `baseline_hash` 绑定候选、分类表和输出配置；调用方不得直接编辑批次文件。

`commit` 默认 dry-run。显式 `--apply` 后，它把保留项写入：

```text
<vault-root>/<collect.twitter.output_directory>/<collect.twitter.daily_filename>
```

`daily_filename` 必须包含一个 `{date}` 占位符。提交器会按配置顺序维护分类标题，在已有分类内追加新条目，并按稳定 ID 标记及来源 URL 去重；因此可以继续合并旧任务生成、尚无标记的同日简报。Twitter 条目使用紧凑编号格式：加粗标题、一句摘要，以及指向原推文的 `@作者` 链接。提交器会把带 `mindos:collect:twitter` 标记的旧详细块收敛为该格式，无标记的旧任务条目保持不变。已有 frontmatter 的 `tweet_count` 与 `last_updated` 会随提交更新。被拒绝的候选不会进入简报，但会和保留项一起登记到 `.mindos/collect/seen.json`，防止后续批次反复要求 Agent 判断。

`.mindos/collect/receipts.json` 只保存批次哈希、首次提交日期、阶段、目标和文件哈希，不保存候选正文。提交会校验决策完整性、分类合法性、批次基线、每日文件结构和重复 ID，并在 vault 级锁内完成。批次可重复提交；重试沿用首次日期，已经处理的候选不会重复写入。

已提交批次确认发生质量事故时，可用原决策文件执行 `commit ... --revert` 预演，并在明确授权后追加 `--apply`。撤回要求决策哈希与原回执完全一致，只删除该批次的托管条目并解除相同 ID 的 `seen`，不会修改人工内容或其他批次；重复撤回返回 `noop`。
