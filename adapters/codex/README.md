# Codex

Codex 按开放 Agent Skills 约定发现仓库级 `.agents/skills/`，因此直接在 Mind OS Builder 仓库根目录工作时无需复制。安装到另一个项目：

```bash
npm install -g mind-os-builder
mindos skills install codex --scope project --project /绝对路径/目标项目 --json
mindos skills install codex --scope project --project /绝对路径/目标项目 --apply --json
```

用户级安装把 `--scope project --project ...` 改为 `--scope user`。中立角色定义位于 `agents/roles/`，`adapters/codex/agents/` 中的 TOML 是 Codex 自定义 Agent 投影示例，不是核心规范。

需要 MCP 时，让 Codex 以 stdio 启动：

```bash
mindos mcp serve /绝对路径/my-mind-os
```

路径约定见 [Codex Agent Skills 官方文档](https://developers.openai.com/codex/skills/)。
