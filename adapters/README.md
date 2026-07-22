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

自动任务不绑定到某个 Agent 产品。`mindos jobs export <id> --adapter agent ...` 会生成符合 `contracts/agent-job.schema.json` 的宿主中立任务清单；`cron` 和 `launchd` Adapter 则只生成命令型 Job 的配置。三者都不负责安装或执行。
