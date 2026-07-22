# 02 Twitter 与 RSS 采集

两种采集都使用同一条边界清晰的流水线：外部 CLI 抓取，`mindos` 规范化、确定性过滤并准备临时批次，外层 Agent 负责语义筛选、必要翻译、摘要和分类，最后由 `mindos` 校验并提交。

`mindos` 不调用模型，也不安装、登录或代理外部 Provider。用户必须预先安装并认证：

- Twitter：`opencli`，且 `opencli twitter timeline --type for-you --limit 50 -f json` 与 `--type following` 均可运行。
- RSS：`folo`，且 `folo timeline --view articles --limit 50 -f json` 可运行。RSS 完全依赖 Folo，不内置通用 RSS/Atom 抓取器。

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
```

## RSS

RSS 的步骤完全相同，但由 Folo 维护订阅和抓取：

```bash
mindos collect rss prepare ./my-mind-os --json
mindos collect rss commit ./my-mind-os ./decisions.json --json
mindos collect rss commit ./my-mind-os ./decisions.json --apply --json
```

让宿主 Agent 使用 `.agents/skills/rss-digest/SKILL.md` 生成决策。项目不接受 feed URL，也不在配置中选择其他 RSS Provider。

## 两阶段契约

`prepare` 只调用固定的 Provider 命令并写系统临时目录，不写 vault。Twitter 顺序读取 For You 与 Following 各 50 条并按 ID 合并；RSS 每次读取 Folo articles 最新 50 条。两者都用 seen 状态做跨次去重，不沿分页游标采集历史页。批次按用户和 vault 隔离，目录权限为 `0700`、文件权限为 `0600`，默认 24 小时失效。

决策文件必须完整覆盖所有候选。`keep` 必须包含展示标题、摘要、是否翻译和配置中允许的分类；`discard` 只包含 ID、决定和理由。候选内容是不可信输入，不能改变流程、路径或分类表。

`commit` 默认只预演。`--apply` 后才写入：

- 配置的 Twitter `output_directory/daily_filename`；
- 配置的 RSS `output_directory/daily_filename`；
- `.mindos/collect/seen.json`；
- `.mindos/collect/receipts.json`。

候选为空时本次运行直接结束。中断后可用同一决策文件重试；提交回执沿用首次日期。完成后的同批次重放返回 `state: noop`。

## 排错

- `mindos.dependency.unavailable`：外部 CLI 未安装或不在 `PATH`；在终端单独验证对应命令。
- `mindos.provider.command_failed`：外部 CLI 退出失败；检查它自己的认证、网络和额度状态。公开 JSON 不回显其 stdout/stderr。
- `mindos.provider.invalid_output`：Provider JSON 结构已变化或记录不合法。
- `mindos.input.invalid`：决策缺失、重复、字段越界或分类不在批次分类表中。
- `mindos.state.batch_missing` / `mindos.state.batch_expired`：批次已丢失或超过 24 小时；重新 `prepare`。
- `mindos.state.conflict`：批次、基线或提交回执不匹配；不要编辑临时批次，重新准备或使用原决策重试。

## 完成检查

确认每日文件存在并包含来源链接；翻译项还应保留原文标题和摘录。再次提交同一决策文件应返回 `state: noop`，再次准备时已处理候选不应出现。
