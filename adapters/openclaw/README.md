# OpenClaw

OpenClaw 的工作区 Skill 目录是 `skills/`，全局目录是 `~/.openclaw/skills/`：

```bash
npm install -g mind-os-builder
mindos skills install openclaw --scope project --project /绝对路径/目标工作区 --json
mindos skills install openclaw --scope project --project /绝对路径/目标工作区 --apply --json
```

也可以从仓库根目录使用 OpenClaw 自带命令逐个安装：

```bash
openclaw skills install .agents/skills/mind-os --as mind-os
```

目录和命令见 [OpenClaw Skills 官方文档](https://github.com/openclaw/openclaw/blob/main/docs/tools/skills.md)。
