# 05 技术调研与 Tech Radar

Research 保存 Provider 状态、证据草稿和引用，并明确提示草稿不等于事实。Tech Radar 读取结构化日期生成建议；默认只 dry-run，不自动搬运或归档页面。

## 前置条件

- `mindos wiki init` 已生成 `<vault>/.mindos/config.yaml`；其中不保存 Key 值。
- 至少预先配置一个真实 Provider 的 Key；可选变量为 `TAVILY_API_KEY`、`EXA_API_KEY`、`PERPLEXITY_API_KEY`、`OPENROUTER_KEY`、`GOOGLE_AI_KEY`。
- Provider 会联网并可能计费；运行前由用户确认本次调用。
- Radar 页面需要信号等级、标题、最新信号日期和来源日期。

## 动作

```bash
export TAVILY_API_KEY="由系统凭证机制注入"
uv run mindos research run ./my-mind-os "MCP 安全边界" \
  --mode quick --providers tavily-search --apply --json
uv run mindos radar review ./my-mind-os \
  --page wiki/concepts/tech-radar.md --today 2026-07-20 --json
```

`--providers auto` 是默认值；也可传逗号列表，例如 `tavily-search,exa,perplexity`。`grok`、`openrouter-grok`、`gemini`、`google-ai`、`tavily`、`tavily_search` 和 `tavily_research` 会归一到正式 ID。可用 `--config <path>` 读取另一份无密钥配置，并用 `--timeout`、`--tavily-research-wait`、`--tavily-poll-interval` 覆盖本次超时。

Research dry-run 仍会真实调用 Provider；先 dry-run 再 `--apply` 会重复调用并可能重复计费。要生成一份草稿时，在确认网络、费用和写入后直接单次使用 `--apply`。Radar 仍先保持 dry-run；只有用户确认后才能加 `--apply` 写建议标记，高判断性的页面搬运始终人工执行。

生成类 POST 不自动重试；网络中断时先查看结果中的 Provider 状态和 Tavily `request_id`，确认远端任务是否已创建后再决定是否重跑。配置里的 `attempts` 只作用于 GET 状态查询。

## 可见产物

- `raw/research/<日期>-<主题>.md`：Provider 草稿、状态、引用和未覆盖缺口，不是未经核查即可发布的最终研报。
- Radar dry-run 的 `metrics`：active、near、actions 三类建议。
- dry-run 不修改雷达页，也不写 `wiki/log.md`。

## 排错

- `providers_unavailable`：所有 Provider 均失败；不会生成正式研报。
- `partial`：至少一个 Provider 成功，失败项会进入 warning 和缺口区。
- Tavily Research 超时：Provider 元数据保留 `request_id` 和最后状态；当前 CLI 不自动续跑该任务。
- `provider_request_failed`：请求已脱敏失败；Tavily 轮询阶段仍会保留已创建任务的 `request_id` 和最后状态。
- Radar 没有结果：检查页面路径和 `最新信号: YYYY-MM-DD`。

## 完成检查

```bash
find my-mind-os/raw/research -name '*.md' -maxdepth 1
```

至少应有一份草稿。按 Tech Research Skill 的最终报告模板核查来源后再形成结论；Radar 页在 dry-run 前后应保持字节一致。
