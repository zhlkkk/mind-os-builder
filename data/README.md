# Data

这里保存 CLI 初始化和离线验证所需的公开数据。

- `core/`：LLM Wiki 的基础目录、`AGENTS.md`、schema、起始页面与不含密钥的 `.mindos/config.yaml`。
- `books/`：Book Base、书籍模板与合成示例。
- `capabilities.yaml`：公开能力发现提示，指向 `contracts/commands.yaml` 静态命令契约；Skills 与 Jobs 分别从 `.agents/skills/` 和 `jobs/` 发现，不提供运行时 Registry。

本目录只能出现合成或公开内容，不得放私人 vault、凭证、真实过滤名单或真实采集结果。

用户可复制的采集配置和离线 Provider 示例位于 `examples/`。这里不再保留迁移期的重复配置或 fixture，避免模板、示例和测试形成多份事实来源。
