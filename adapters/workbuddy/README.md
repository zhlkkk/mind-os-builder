# WorkBuddy

项目级接入使用 `.agents/skills/`，与本仓库的规范目录一致：

```bash
npm install -g mind-os-builder
mindos skills install workbuddy --scope project --project /绝对路径/目标项目 --json
mindos skills install workbuddy --scope project --project /绝对路径/目标项目 --apply --json
```

也可以在 WorkBuddy 中上传本地 Skill 包，或让它读取本仓库后按当前任务安装。需要 MCP 时，在项目级 `.workbuddy/mcp.json` 或用户级 `~/.workbuddy/mcp.json` 中配置一个 stdio Server，命令为：

```bash
mindos mcp serve /绝对路径/my-mind-os
```

本地 Skill 的使用方式见 [WorkBuddy Skills 官方文档](https://cloud.tencent.com/document/product/1831/134432)，MCP 配置位置见 [WorkBuddy MCP 官方指南](https://www.workbuddy.ai/docs/zh/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide)。
