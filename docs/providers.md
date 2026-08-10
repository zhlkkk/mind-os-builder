# Provider 配置与安全边界

Provider 从用户已经配置好的外部工具获取记录，不写 vault，也不决定哪些内容进入简报。`mindos` 按固定顺序执行：`抓取 → 规范化 → 规则过滤 → 临时批次 → Agent 决策 → 校验 → 提交`。

## 采集 Provider

| 来源 | Provider | 前置命令 | 安装与认证责任 |
|---|---|---|---|
| Twitter | OpenCLI | `opencli twitter timeline --type for-you --limit 50 --window background -f json` 与 `--type following` | 用户 |
| Twitter（显式备用） | ego-browser | `.agents/skills/twitter-digest/scripts/collect-ego-browser.sh <capture.json> <run-id>` | 用户 |
| RSS | Folo CLI | `folo timeline --view articles --limit 50 -f json` | 用户 |

项目不会自动安装或认证这些工具，也不会保存它们的 Cookie、Token 或账号信息。Twitter 默认且不会静默偏离 OpenCLI；ego-browser 只有在命令明确指定 `--provider ego-browser --input <capture.json>` 时才生效。RSS 完全依赖 Folo，且没有内置 HTTP 抓取器、feed URL 参数、fixture Provider 或运行时 Provider 选择。

`mindos doctor --json` 只报告依赖是否可执行。实际使用前，应在同一终端环境中独立运行上表命令并完成外部工具自己的登录流程。ego-browser 需要能继承已有 X 登录态，CLI 不读取或管理登录信息。

ego-browser 备用路径由 Skill 负责浏览器采集，CLI 只摄入采集 JSON：

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

脚本按随机 run ID 使用独立任务空间，读取 For You 与 Following 各最多 50 条，过滤广告并按稳定推文 ID 合并；采集成功后只关闭本次空间。采集文件权限为 `0600`，不能放入 vault 或仓库。apply 前可用工作区助手精确清理；进入 applying 后保留原 decisions 供恢复和撤回，终态保留 30 天。X 的 DOM、滚动加载和展示翻译会变化，因此它是显式备用方案，不是 OpenCLI 的自动故障转移。

## 采集配置

`mindos wiki init <vault> --apply` 创建 `<vault>/.mindos/config.yaml`。Twitter 与 RSS 各自配置，但字段一致：

```yaml
collect:
  twitter:
    output_directory: raw/twitter
    daily_filename: "{date}-X精选信息简报.md"
    filters:
      include_any: []
      exclude_any: []
      weights: {}
      minimum_score: 0
      output_limit: 50
    categories:
      agent-systems: Agent 系统
      other: 其他
  rss:
    output_directory: raw/rss
    daily_filename: "{date}-Folo精选信息简报.md"
    mark_read_after_commit: false
    filters:
      include_any: []
      exclude_any: []
      weights: {}
      minimum_score: 0
      output_limit: 50
    categories:
      agent-systems: Agent 系统
      other: 其他
```

- `include_any`：非空时至少命中一个词。
- `exclude_any`：命中即排除，优先于评分。
- `weights` 与 `minimum_score`：确定性评分和门槛。
- `output_limit`：候选上限，最多 200；同分保持 Provider 顺序。
- `categories`：Agent 只能选择这里声明的分类键。
- `output_directory`：必须是 vault 内 `raw/` 下的相对目录。
- `daily_filename`：必须是包含且只包含一个 `{date}` 占位符的 Markdown 文件名，不能包含目录或 `..`。
- `mark_read_after_commit`：仅适用于 RSS，布尔值，默认 `false`；开启后在本地提交成功后调用 Folo，把本批次所有已判断条目标记为已读。

配置只保存业务规则，不保存密钥、Token、Cookie、用户名或第三方 CLI 的认证文件。采集命令固定从 vault 配置读取，不接受另一份配置路径。

已读同步失败不会回滚本地简报和 seen。下一次 RSS 任务必须先运行 `mindos collect rss recover <vault> --json`；存在未完成批次时，再在已授权任务中追加 `--apply`。恢复只使用受保护的临时批次，不依赖原决策文件。

## Agent 与提示词边界

Twitter 使用 `.agents/skills/twitter-digest/`，RSS 使用 `.agents/skills/rss-digest/`。每个 Skill 将筛选、翻译摘要、分类和决策组装拆成独立提示词。宿主可以是 Claude Code、Codex、Pi、Hermes、OpenClaw 或 WorkBuddy；CLI 契约不依赖具体宿主或模型。

CLI 不执行提示词，也不信任 Agent 输出。`commit` 会检查完整覆盖、字段集合、合法分类、批次基线和 vault 归属；只有显式 `--apply` 才写 vault，并且只有 RSS 已读开关明确开启时才修改 Folo 外部状态。

## Tech Research Provider

Tech Research 与采集模块分离。项目不提供内置 Provider Runtime，也不从 `.mindos/config.yaml`、进程环境或 CLI 参数读取研究 Key。Agent 使用宿主已有的工具完成研究，`mindos` 只校验和提交候选报告。

Skill 按能力而不是厂商选择工具：

| 研究能力 | 可选接入举例 | 是否必需 |
|---|---|---|
| Web 搜索 | 宿主内置 Web Search、Tavily、Brave、Exa、Perplexity MCP/插件 | 至少一种可追溯来源能力 |
| Web 抓取 | 宿主浏览器、fetch/crawl、Exa contents | 建议，用于回到原文 |
| 代码与论文 | GitHub、论文检索、Exa | 按主题 |
| 深度研究 | Tavily Research、Perplexity Research、宿主 research 工具 | `deep` 建议 |
| 社媒信号 | OpenCLI、宿主社媒工具、公开搜索 | 可选，不能单独证明事实 |

用户在 Claude Code、Codex、Pi、Hermes、OpenClaw 或 WorkBuddy 自己的配置层安装 MCP/插件或外部 CLI，并在那里注入 Key。常见适配器可能要求 `TAVILY_API_KEY`、`BRAVE_API_KEY`、`EXA_API_KEY`、`PERPLEXITY_API_KEY`、`OPENROUTER_API_KEY` 或 `GOOGLE_API_KEY`；实际变量名以所选适配器为准，这些名称和值都不写入 vault 配置。项目不自动安装工具、申请账号、购买额度或创建 `.env`。

使用内置 Web 工具时无需为项目增加配置；把“使用 `.agents/skills/tech-research/SKILL.md` 调研主题，并将候选文件交给 `mindos research commit`”发给 Agent 即可。使用 MCP 或 CLI 时，先在宿主中独立确认工具能返回 URL，再启动 Skill。

只有一种工具时仍可研究，但报告必须收窄结论并说明单一来源限制。部分工具失败时生成 `partial` 报告和“证据缺口”；全部工具不可用时停止，不生成伪完成报告。OpenRouter/Grok 或 Google/Gemini 可帮助反方审视和综合，但不是硬依赖，模型输出也不是来源。

候选报告在 vault 外生成，frontmatter 记录本次真实使用的能力和来源。提交命令默认 preview：

```bash
mindos research commit ./my-mind-os /tmp/candidate.md \
  --target raw/research/2026-07-21-topic.md --json
mindos research commit ./my-mind-os /tmp/candidate.md \
  --target raw/research/2026-07-21-topic.md --apply --json
```

CLI 不联网、不调用模型、不执行提示词，也不会覆盖同名不同内容的已有报告。

## 失败语义

- `mindos.dependency.unavailable`：命令未安装或不在 `PATH`。
- `mindos.provider.command_failed`：外部命令退出失败或超时。
- `mindos.provider.invalid_output`：外部 JSON 结构或记录不合法。
- `mindos.state.batch_missing` / `mindos.state.batch_expired`：临时批次不可用。
- `mindos.state.conflict`：批次、基线或回执发生冲突。

公开结果不会包含 Provider stdout/stderr，避免泄漏凭证、用户数据和本机路径。原始候选只保存在权限受限的系统临时批次中；提交回执不保存候选正文。

## 可重复验证

自动测试用临时的同名可执行文件模拟 OpenCLI、ego-browser 和 Folo，不访问真实账号：

```bash
npm run test:u4
```

真实账号可用性不属于离线测试保证；它由用户在自己的 Provider CLI 中验证。

Twitter 仍采用最新窗口：默认 OpenCLI 或显式 ego-browser 路径每次顺序读取 For You 与 Following 各最多 50 条并按 ID 合并。RSS 读取 Folo articles 未读视图，每页 50 条，沿 Folo 分页游标最多读取 10 页或 500 条，从而让历史未读积压重新进入候选；跨小时去重由 `.mindos/collect/seen.json` 完成。
