# Provider 配置与安全边界

Provider 只负责从用户已经配置好的外部工具获取记录和下一游标。它不写 vault、不执行语义判断，也不决定最终简报。`mindos` 固定执行 `fetch → normalize → deterministic filter → temporary batch → outer Agent decision → validate → commit`。

## 采集 Provider

| 来源 | 唯一 Provider | 前置命令 | 安装与认证责任 |
|---|---|---|---|
| Twitter | OpenCLI | `opencli twitter timeline -f json` | 用户 |
| RSS | Folo CLI | `folocli entries --json` | 用户 |

项目不会自动安装或认证这两个工具，也不会保存它们的 Cookie、Token 或账号信息。RSS 完全依赖 Folo；没有内置 HTTP 抓取器、feed URL 参数、fixture Provider 或运行时 Provider 选择。

`mindos doctor --json` 只报告依赖是否可执行。实际使用前，应在同一终端环境中独立运行上表命令并完成外部工具自己的登录流程。

## 采集配置

`mindos wiki init <vault> --apply` 创建 `<vault>/.mindos/config.yaml`。Twitter 与 RSS 各自配置，但字段一致：

```yaml
collect:
  twitter:
    output_directory: raw/collect/twitter
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
    output_directory: raw/collect/rss
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
- `categories`：外层 Agent 只能选择这里声明的分类键。
- `output_directory`：必须是 vault 内 `raw/` 下的相对目录。

配置只保存业务规则，不保存密钥、Token、Cookie、用户名或第三方 CLI 的认证文件。采集命令固定从 vault 配置读取，不接受另一份配置路径。

## Agent 与提示词边界

Twitter 使用 `.agents/skills/twitter-digest/`，RSS 使用 `.agents/skills/rss-digest/`。每个 Skill 将筛选、翻译摘要、分类和决策组装拆成独立提示词。宿主可以是 Claude Code、Codex、Pi、Hermes、OpenClaw 或 WorkBuddy；CLI 契约不依赖具体宿主或模型。

CLI 不执行提示词，也不信任 Agent 输出。`commit` 会检查完整覆盖、字段集合、合法分类、批次基线、vault 归属和游标状态；只有显式 `--apply` 才写 vault。

## Tech Research Provider

Tech Research 与采集模块分离。它的 Key、路由和证据契约见 Tech Research Skill；Key 值始终由用户通过环境或宿主凭证机制提供。项目不申请账号、购买额度、写入 `.env` 或自动安装 Provider SDK。

## 失败语义

- `mindos.dependency.unavailable`：命令未安装或不在 `PATH`。
- `mindos.provider.command_failed`：外部命令退出失败或超时。
- `mindos.provider.invalid_output`：外部 JSON 结构或记录不合法。
- `mindos.state.batch_missing` / `mindos.state.batch_expired`：临时批次不可用。
- `mindos.state.conflict`：批次、基线、游标或回执发生冲突。

公开结果不会包含 Provider stdout/stderr，避免泄漏凭证、用户数据和本机路径。原始候选只保存在权限受限的系统临时批次中；提交回执不保存候选正文。

## 可重复验证

自动测试用临时的同名可执行文件模拟 OpenCLI 和 Folo，不访问真实账号：

```bash
npm run test:u4
```

真实账号可用性不属于离线测试保证；它由用户在自己的 Provider CLI 中验证。
