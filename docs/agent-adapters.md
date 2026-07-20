# Agent 适配器

Mind OS Builder 的确定性业务能力只实现一次：应用层 Action 返回统一 `RunEnvelope`。CLI 是稳定参考接口；Agent Skills 通过 CLI 调用；MCP 只做输入收窄、固定本地边界和结果转发。

## Agent Skills

随包发布的 Skills 位于 `mind_os_builder/assets/skills/`。每个 Skill 只使用开放 Agent Skills 元数据、客户端中立流程和 `mindos ... --json` 命令，不依赖特定客户端的工具名、权限语法或子代理接口。

安装 Skill 时复制完整目录，并确认环境中存在 Python 3.11+ 与 `mindos`。写操作必须先 dry-run，再由用户明确选择 `--apply`。

## MCP stdio

MCP v1 只支持本地 stdio。宿主在创建 Server 时必须注入：

- 一个启动后不可更改的 vault 根目录；
- 调用共享应用服务的 `ActionDispatcher`；
- 可选的 Job 清单和最近运行摘要。

Server 为 Action Registry 中的动作生成同名下划线工具，例如 `wiki.lint` 映射为 `wiki_lint`。每个工具接收 `parameters` 与默认值为 `false` 的 `apply`。resources 提供 `mindos://capabilities`、`mindos://jobs`、`mindos://schemas/config` 和 `mindos://runs/latest`。

第一版拒绝 HTTP 等远程 transport。stdio 的 stdout 只承载 MCP 协议；宿主日志必须写 stderr，并且不得包含凭证或 vault 内容。
