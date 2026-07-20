# Agent 宿主适配

核心目录和 CLI 不依赖任何 Agent 产品。本目录只记录外层宿主如何发现 Skills、读取自定义 Agent 契约，以及如何选择性接入 MCP。

- [Codex](codex/README.md)
- [Claude Code](claude-code/README.md)
- [Pi](pi/README.md)
- [Hermes](hermes/README.md)
- [OpenClaw](openclaw/README.md)
- [WorkBuddy](workbuddy/README.md)

统一安装器默认只预演：

```bash
python scripts/install_harness.py codex --scope project --project /绝对路径/目标项目
python scripts/install_harness.py codex --scope project --project /绝对路径/目标项目 --apply
```

它只安装 `.agents/skills/` 中的完整 Skill，不覆盖同名不同内容的现有 Skill。Distill 安装副本会附带从规范源 `agents/roles/` 生成的 `references/roles/`，因此离开本仓库后仍可独立使用；仓库本身不维护第二份角色文件。宿主专用 Agent 配置应在对应适配目录中维护。
