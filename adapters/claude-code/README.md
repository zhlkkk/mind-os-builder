# Claude Code

Claude Code 的项目级 Skill 目录是 `.claude/skills/`。用统一安装器把规范 Skill 投影过去：

```bash
npm install -g mind-os-builder
mindos skills install claude-code --scope project --project /绝对路径/目标项目 --json
mindos skills install claude-code --scope project --project /绝对路径/目标项目 --apply --json
```

用户级安装使用 `--scope user`。`agents/roles/` 是中立角色契约；如果要使用 Claude Code 自定义 subagent，可以让 Claude Code 读取对应角色文件后生成项目级 `.claude/agents/` 配置，但不要把角色逻辑复制进 Python 核心。

需要 MCP 时，宿主命令仍是：

```bash
mindos mcp serve /绝对路径/my-mind-os
```

目录与 Skill 格式见 [Claude Code Skills 官方文档](https://code.claude.com/docs/en/skills)。
