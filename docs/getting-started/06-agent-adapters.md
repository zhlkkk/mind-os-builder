# 06 Agent、MCP 与自动任务适配

## 安装到 Agent 宿主

先预演，再显式安装：

```bash
mindos skills install codex --scope project --project /绝对路径/目标项目 --json
mindos skills install codex --scope project --project /绝对路径/目标项目 --apply --json
```

把 `codex` 换成 `claude-code`、`pi`、`hermes`、`openclaw` 或 `workbuddy`。用户级安装改用 `--scope user`。具体原生目录见 [`adapters/`](../../adapters/README.md)。

## 让自己的运行层读取 Jobs

```bash
mindos jobs list --json
mindos jobs show lint --json
```

不想自己解释 YAML 时，可以生成宿主配置：

```bash
mindos jobs export lint --adapter cron --input vault=/绝对路径/Mind-OS --executable /绝对路径/mindos --json
mindos jobs export distill --adapter agent --input vault=/绝对路径/Mind-OS --input source=journals/2026-07-22.md --json
```

运行层把 `command` 当 argv，把 `skill` 交给 Agent，并遵守 effects 与 schedule。导出结果只供审查，不会安装或执行；cron、launchd、CI 和 Agent 工具仍是可选运行层。完整限制和 launchd 示例见 [`jobs.md`](../jobs.md)。

## 可选 MCP

在宿主中配置本地 stdio 命令：

```bash
mindos mcp serve /绝对路径/my-mind-os
```

Server 只暴露四个静态工具，vault 在启动时固定。`mindos_wiki_init` 默认 preview，只有参数 `apply: true` 才写入。使用 `npm install --omit=optional` 的 CLI 没有 MCP SDK，但其他命令不受影响。

## 完成检查

确认 Skill 重复安装返回 `noop`，`jobs list` 返回六个任务，`jobs export` 返回 `preview`；MCP 宿主能列出四个工具，并且 CLI 与 MCP lint 的 v1 JSON 领域字段一致。
