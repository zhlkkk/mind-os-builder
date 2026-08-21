# 输出与状态契约

默认 `prepare` 顺序抓取 OpenCLI 的 For You 与 Following 时间线各最多 50 条。显式备用路径先由 Skill 的 ego-browser 脚本采集相同两路时间线，再用 `prepare --provider ego-browser --input <capture.json>` 摄入。两条路径都按稳定 ID 合并，并由 CLI 把批次写入系统临时目录，不写 vault。批次由随机 `batch_id` 标识，并用 `baseline_hash` 绑定候选、分类表和输出配置；调用方不得直接编辑批次文件。ego-browser 采集文件不是批次，必须放在权限受限的系统临时目录并在 `prepare` 后删除。

Skill 的 `manage-run-workspace.sh` 为每次运行创建当前用户独占的 0700 工作区，并用原子创建锁避免同一时刻产生两个运行。capture、batch ID、阶段和 `decisions-twitter-<batch-id>.json` 都绑定同一随机运行 ID 和规范 vault 路径。apply 前的失败或空批次可精确清理该工作区；转换为 applying 后必须保留原 decisions，供同哈希恢复和撤回。applied/reverted 的 decisions 保留 30 天，只有 owner、vault、run marker、阶段和保留期全部匹配时才自动回收；`recover` 会列出全部非终态残留，调用方只恢复 applying，其他 apply 前阶段受控清理，且不按年龄宽泛删除。EXIT、INT、TERM 清理是尽力而为，SIGKILL 或宿主崩溃由下次 `recover` 识别。

`prepare.data.candidates[]` 的 Twitter 候选会在 Provider 可用时携带 `replies`、`views`、`retweets`、`likes` 四项非负整数；字段缺失表示没有采到，不能解释为零。

`commit` 默认 dry-run。显式 `--apply` 后，它把保留项写入：

```text
<vault-root>/<collect.twitter.output_directory>/<collect.twitter.daily_filename>
```

`daily_filename` 必须包含一个 `{date}` 占位符。提交器会按配置顺序维护分类标题，在已有分类内追加新条目，并按稳定 ID 标记及来源 URL 去重；因此可以继续合并旧任务生成、尚无标记的同日简报。Twitter 条目使用紧凑编号格式：加粗标题、一句摘要、指向原推文的 `@作者` 链接，以及可用互动快照的“评论 / 浏览 / 转发 / 点赞”行；未采到的单项不展示。提交器会把带 `mindos:collect:twitter` 标记的旧详细块收敛为该格式，无标记的旧任务条目保持不变。已有 frontmatter 的 `tweet_count` 与 `last_updated` 会随提交更新。被拒绝的候选不会进入简报，但会和保留项一起登记到 `.mindos/collect/seen.json`，防止后续批次反复要求 Agent 判断。

`.mindos/collect/receipts.json` 只保存批次哈希、首次提交日期、阶段、目标和文件哈希，不保存候选正文。提交会校验决策完整性、分类合法性、翻译与摘要质量、批次基线、每日文件结构和重复 ID，并在 vault 级锁内完成。Twitter 展示标题和摘要必须包含中文，非中文原文还必须标记为已翻译。Twitter 提交结果的 `data.quality` 给出同一份确定性质量报告；`mindos collect twitter audit <vault> --date YYYY-MM-DD --json` 可只读复查已经生成的日报。审计只解析精确的托管 marker、紧随其后的条目和来源 URL，不会把代码块、人工条目或泛化数字当作托管 ID。输入文件必须是严格 UTF-8；审计和提交链路不依赖 Python。批次可重复提交；重试沿用首次日期，已经处理的候选不会重复写入。

已提交批次确认发生质量事故时，可用原决策文件执行 `commit ... --revert` 预演，并在明确授权后追加 `--apply`。撤回要求决策哈希与原回执完全一致，只删除该批次的托管条目并解除相同 ID 的 `seen`，不会修改人工内容或其他批次；重复撤回返回 `noop`。
