# Provider 配置与安全边界

Provider 位于网络或外部 CLI seam，只负责获取原始记录与下一游标，不写 vault、不执行过滤、不决定最终简报。所有记录都要经过公共 Normalize、Filter、Review、Render、Validate、Promote 管线。

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
