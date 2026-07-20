# Provider 配置与安全边界

Provider 位于网络或外部 CLI seam，只负责获取原始记录与下一游标，不写 vault、不执行过滤、不决定最终简报。所有记录都要经过公共 Normalize、Filter、Review、Render、Validate、Promote 管线。

Tech Research 使用另一条串行流水线：证据 Provider 先取证，OpenRouter 做反方审视，Google 综合前序上下文。它不经过采集过滤管线，也不使用通用 HTTP 网关。

## 支持矩阵

| Provider | 定位 | 网络 | 凭证 | CI |
|---|---|---:|---|---|
| Twitter fixture | 稳定离线基线 | 否 | 无 | 必跑 |
| 通用 RSS/Atom | 稳定基线 | 真实使用时需要 | 通常无 | 使用内存 XML |
| Twitter OpenCLI | macOS 实验 Adapter | 是 | 由外部 CLI 管理 | 不运行 |
| Folo CLI | 实验 Adapter | 是 | 由 Folo 管理 | 不运行 |

fixture 证明领域契约，不证明外部服务可用。通用 RSS/Atom 不依赖 Folo；实验 Adapter 失效时不会影响核心 Wiki 或离线示例。

## 配置

自定义 Agent 或运行层可以从合成配置开始；内置 CLI 当前使用显式命令参数，不会自动加载该文件：

```bash
cp examples/config/collect.yaml ./my-collector.yaml
```

过滤字段：

- `include_any`：至少命中一个词；为空表示不限制。
- `exclude_any`：命中即排除，优先于评分。
- `weights` 与 `minimum_score`：确定性评分门槛。
- `output_limit`：最终输出上限，同分保持 Provider 原顺序。
- `llm_review.unavailable`：`heuristic` 明示降级，`fail` 失败关闭。

配置只存业务参数。API key、token、Cookie、用户名和真实作者名单不得进入 YAML、示例或 Git。

## Tech Research Provider

`mindos wiki init` 会创建 `<vault>/.mindos/config.yaml`。该文件只保存开关、密钥环境变量名、模型与超时；Key 值始终由用户通过环境或系统凭证机制提供。项目不自动申请账号、购买额度、写入 `.env` 或安装第三方 SDK。

| Provider ID | 作用 | 默认 Key 环境变量 | 默认模型 |
|---|---|---|---|
| `tavily-search` | 网页证据与来源片段 | `TAVILY_API_KEY` | Tavily Search API |
| `tavily-research` | deep 模式异步深度研究 | `TAVILY_API_KEY` | quick=`mini`、standard=`auto`、deep=`pro` |
| `exa` | 官方文档、代码、论文与摘录 | `EXA_API_KEY` | Exa Search `auto` |
| `perplexity` | 实时事实与引用 | `PERPLEXITY_API_KEY` | `sonar-pro`；deep=`sonar-deep-research` |
| `openrouter` | Grok 风格反方审视 | `OPENROUTER_KEY` | `x-ai/grok-4.3` |
| `google` | Gemini 多源综合 | `GOOGLE_AI_KEY` | `gemini-2.5-pro` |

没有 Brave Provider。Twitter 的 OpenCLI 和 RSS 的 Folo 也属于采集模块，不进入 Tech Research 路由。

`auto` 的顺序固定：

```text
quick/standard: tavily-search → exa → perplexity → openrouter → google
deep:           tavily-search → tavily-research → exa → perplexity → openrouter → google
```

串行是语义要求：OpenRouter 接收前序证据用于识别 hype 和疑点，Google 接收包含 OpenRouter 结果的上下文用于综合。单个 Provider 缺 Key 会标记 `skipped`，调用失败会标记 `failed`，两者都不会触发静默替换；至少一个成功时总体为 `partial`，全部不可用时返回 `providers_unavailable` 且不写草稿。

配置中的 `attempts` 与 `retry_backoff_seconds` 只控制可安全重放的 GET，例如 Tavily Research 状态轮询。Search、Research 创建和模型生成等 POST 始终只提交一次，避免服务端已受理但客户端超时后重复创建任务或重复计费。GET 仅对网络错误、`429` 和 `5xx` 重试；其他 `4xx` 直接失败。Tavily 轮询的请求、退避和休眠共同受 `tavily_research_wait_seconds` 总时限约束。

证据 Provider 返回的网页文本属于不可信数据。进入 OpenRouter 与 Google 前，核心会按 Provider 分段限制总长度、保留反方审视阶段，并用专用边界和 system instruction 禁止模型执行资料中的指令。这只能降低间接提示注入风险，不能把模型草稿变成可信事实；正式结论仍须回到引用来源核验。

模型也可由下列环境变量覆盖，优先级高于 YAML：

- `TECH_RESEARCH_PERPLEXITY_MODEL`
- `TECH_RESEARCH_OPENROUTER_MODEL`
- `TECH_RESEARCH_GOOGLE_MODEL`

端点固定为各家官方 API，不从 YAML 或命令行接受任意 URL。当前适配对应 [Tavily Search/Research](https://docs.tavily.com/documentation/api-reference/introduction)、[Exa Search](https://exa.ai/docs/reference/search)、[Perplexity Sonar](https://docs.perplexity.ai/api-reference/sonar-post)、[OpenRouter Chat Completions](https://openrouter.ai/docs/api/reference/overview) 与 [Gemini generateContent](https://ai.google.dev/api/generate-content)。

## 失败语义

- `unavailable`：命令未安装。
- `timeout`：外部命令超时。
- `authentication`：认证失败。
- `rate_limited`：限流。
- `budget_exhausted`：余额或配额不足。
- `invalid_json` / `invalid_payload`：外部契约变化。
- `validation_failed`：规范化结果无法形成带来源的合法产物。
- `promotion_failed`：路径保护、符号链接或写入冲突阻止提升。

子进程 stdout/stderr 不进入公开错误。RSS 告警会剥离 URL 用户信息、查询参数和片段。Provider 部分失败进入 warnings；验证或提升失败时游标不提交。

## 真实烟测

真实测试默认跳过。只在独立临时 vault 中显式启用：

```bash
MINDOS_RUN_LIVE=1 uv run pytest tests/live/test_live_rss.py -q
MINDOS_RUN_LIVE=1 uv run pytest tests/live/test_live_twitter.py -q
```

RSS 还需要 `MINDOS_LIVE_RSS_URL`。测试报告只记录状态、计数和脱敏错误码，不提交返回原文、用户标识、凭证或本机路径。
