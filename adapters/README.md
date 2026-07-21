# Agent 宿主适配

本目录只记录宿主原生发现路径和可选 MCP 配置，不保存业务逻辑。

- [Codex](codex/README.md)
- [Claude Code](claude-code/README.md)
- [Pi](pi/README.md)
- [Hermes](hermes/README.md)
- [OpenClaw](openclaw/README.md)
- [WorkBuddy](workbuddy/README.md)

统一安装方式：

```bash
mindos skills install codex --scope project --project /绝对路径/目标项目 --json
mindos skills install codex --scope project --project /绝对路径/目标项目 --apply --json
```

安装器复制完整 Skill，不覆盖冲突。Distill 副本同时物化五个中立角色文件。MCP 是可选项，统一启动命令为 `mindos mcp serve /绝对路径/vault`。
