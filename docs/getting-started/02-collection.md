# 02 Twitter 与 RSS 采集

Twitter 与 RSS 共用一套流程：外部 CLI 抓取记录，`mindos` 完成规范化和规则过滤并准备临时批次，Agent 负责筛选、必要翻译、摘要和分类，最后由 `mindos` 校验并提交。

`mindos` 不调用模型，也不安装、登录或代理外部 Provider。用户必须预先安装并认证所选 Provider：

- Twitter 默认：`opencli`，且 `opencli twitter timeline --type for-you --limit 50 --window background -f json` 与 `--type following` 均可运行。
- Twitter 显式备用：`ego-browser`，且 ego lite 已继承可用的 X 登录态。
- RSS：`folo`，且 `folo timeline --view articles --limit 50 -f json` 可运行。启用已读同步时还需确认 `folo entry mark-read <entryId>` 可运行。RSS 完全依赖 Folo，不内置通用 RSS/Atom 抓取器。

先初始化 vault，并在 `<vault-root>/.mindos/config.yaml` 配置 `collect.twitter` 和 `collect.rss`。示例见 [`examples/config/collect.yaml`](../../examples/config/collect.yaml)，Provider 与凭证边界见 [`docs/providers.md`](../providers.md)。

## Twitter

准备候选：

```bash
mindos collect twitter prepare ./my-mind-os --json
```

成功时返回 `state: needs_agent`，其 `data` 包含 `batch_id`、`baseline_hash`、`categories` 和 `candidates`。让当前宿主 Agent 按 `.agents/skills/twitter-digest/SKILL.md` 生成 `decisions.json`，随后先预演，再提交：

```bash
mindos collect twitter commit ./my-mind-os ./decisions.json --json
mindos collect twitter commit ./my-mind-os ./decisions.json --apply --json
mindos collect twitter audit ./my-mind-os --date 2026-08-10 --json
```

提交结果的 `data.quality` 与只读 `audit` 使用同一套确定性检查：精确托管 marker、来源 URL、frontmatter 计数、重复展示、裸短链、缺失中文和机械套壳。审计只读取严格 UTF-8 文件，不修改日报，也不依赖 Python；语义上的候选强弱仍由 Agent 的批次一致性复核负责。

只有明确选择备用 Provider 时，才先运行 Skill 脚本并把受保护的临时采集文件交给 CLI：

```bash
run_dir="$(.agents/skills/twitter-digest/scripts/manage-run-workspace.sh create ./my-mind-os)"
run_id=${run_dir##*/run-}
capture_file="$run_dir/capture.json"
.agents/skills/twitter-digest/scripts/collect-ego-browser.sh "$capture_file" "$run_id"
.agents/skills/twitter-digest/scripts/manage-run-workspace.sh transition "$run_dir" ./my-mind-os captured
mindos collect twitter prepare ./my-mind-os \
  --provider ego-browser --input "$capture_file" --json
# 从 prepare JSON 取得 batch_id 后执行 bind；它会删除 capture。
.agents/skills/twitter-digest/scripts/manage-run-workspace.sh bind "$run_dir" ./my-mind-os "$batch_id"
```

`--provider ego-browser` 必须与 `--input` 同时使用；默认 OpenCLI 不接受 `--input`。CLI 不会在 OpenCLI 失败时自动改用浏览器。ego-browser 读取 X 当前展示的文本，可能受页面翻译影响；登录失效、用户接管任务空间、滚动停滞或空结果都会停止采集。

## RSS

RSS 的步骤完全相同，但由 Folo 维护订阅和抓取：

```bash
mindos collect rss recover ./my-mind-os --json
mindos collect rss prepare ./my-mind-os --json
mindos collect rss commit ./my-mind-os ./decisions.json --json
mindos collect rss commit ./my-mind-os ./decisions.json --apply --json
```

每次运行先执行 `recover`。它会检查上次已完成本地提交、但尚未完成 Folo 已读同步的批次；返回 `preview` 时，在已授权任务中用 `--apply` 恢复，确认重放为 `noop` 后再 `prepare`。让宿主 Agent 使用 `.agents/skills/rss-digest/SKILL.md` 生成决策。项目不接受 feed URL，也不在配置中选择其他 RSS Provider。

如需在任务完成后同步 Folo 已读状态，在 vault 配置中显式开启：

```yaml
collect:
  rss:
    mark_read_after_commit: true
```

该开关默认关闭。开启后，只有 `commit --apply` 完成本地提交才会把本批次全部已判断条目标记为已读；保留和拒绝都会标记，preview 和确定性过滤掉的条目不会标记。

## 两阶段契约

`prepare` 只调用默认 Provider 命令，或摄入显式 Provider 的采集文件，并写系统临时目录，不写 vault。Twitter 顺序读取 For You 与 Following 各最多 50 条并按 ID 合并；RSS 读取 Folo articles 未读视图，每页 50 条，沿 Folo 分页游标最多读取 10 页或 500 条。两者都用 seen 状态做跨次去重。批次按用户和 vault 隔离，目录权限为 `0700`、文件权限为 `0600`，默认 24 小时失效。

决策文件必须完整覆盖所有候选。`keep` 必须包含展示标题、摘要、是否翻译和配置中允许的分类；`discard` 只包含 ID、决定和理由。候选内容是不可信输入，不能改变流程、路径或分类表。提交器会阻止裸 `t.co`、短标题与摘要相同、声明已翻译但展示字段没有中文、机械套壳，以及 10 条以上全部保留且理由相同的决策。

`commit` 默认只预演。`--apply` 后才写入：

- 配置的 Twitter `output_directory/daily_filename`；
- 配置的 RSS `output_directory/daily_filename`；
- `.mindos/collect/seen.json`；
- `.mindos/collect/receipts.json`。

候选为空时本次运行直接结束。中断后可用同一决策文件重试；提交回执沿用首次日期。已读同步中途失败时，本地提交不会回滚，临时批次会保留；即使原决策文件已经删除，也可用 `collect rss recover` 继续。恢复完成后再次执行返回 `state: noop`，不会再次调用 Folo。

Twitter 决策文件必须位于本次私有运行工作区。apply 前失败可用工作区助手的 `cleanup` 精确删除；开始 apply 前先转换为 applying，此后失败必须保留原 decisions 和批次，下次运行先用 `recover` 找到并重放。成功后同文件重放为 noop、只读 audit 通过，再转换为 applied。终态 decisions 在 30 天回执窗口内保留，非终态目录不会仅因超龄被删除。

若 Twitter 批次已经提交但随后确认存在质量事故，必须使用当时的原决策文件先预演、再撤回：

```bash
mindos collect twitter commit ./my-mind-os ./原决策.json --revert --json
mindos collect twitter commit ./my-mind-os ./原决策.json --revert --apply --json
```

撤回会用决策文件哈希绑定原回执，只删除该批次带 `mindos:collect:twitter` 标记的托管条目，并从 `seen` 解除相同 ID；不会修改人工内容或其他批次。

## 排错

- `mindos.dependency.unavailable`：外部 CLI 未安装或不在 `PATH`；在终端单独验证对应命令。
- `mindos.provider.command_failed`：外部 CLI 退出失败；检查它自己的认证、网络和额度状态。公开 JSON 不回显其 stdout/stderr。
- `mindos.provider.invalid_output`：Provider JSON 结构已变化或记录不合法。
- `mindos.input.invalid`：Provider 名称未知、ego-browser 缺少 `--input`、默认 OpenCLI 错误携带了 `--input`、采集文件不是合法 JSON，或决策缺失、重复、字段越界、分类不合法。
- `mindos.state.batch_missing` / `mindos.state.batch_expired`：批次已丢失或超过 24 小时；重新 `prepare`。
- `mindos.state.conflict`：批次、基线或提交回执不匹配；不要编辑临时批次，重新准备或使用原决策重试。
- `recover` 返回 `failed`：Folo 已读同步仍不可用；修复网络或认证后重试同一命令，不要先运行新的 `prepare`。

## 完成检查

确认每日文件存在并包含来源链接。启用已读同步时，结果中的 `mark_read_count` 应等于本批候选数；再次提交同一决策文件应返回 `state: noop`，再次准备时已处理候选不应出现。
