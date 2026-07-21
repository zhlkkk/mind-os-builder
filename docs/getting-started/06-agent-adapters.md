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

运行层把 `command` 当 argv，把 `skill` 交给 Agent，并遵守 effects 与 schedule。项目不执行 Job，也不提供调度器；cron、launchd、CI 和 Agent 工具都是可选运行层。

## 可选 MCP

在宿主中配置本地 stdio 命令：

```bash
mindos mcp serve /绝对路径/my-mind-os
```

Server 只暴露四个静态工具，vault 在启动时固定。`mindos_wiki_init` 默认 preview，只有参数 `apply: true` 才写入。使用 `npm install --omit=optional` 的 CLI 没有 MCP SDK，但其他命令不受影响。

## 完成检查

确认 Skill 重复安装返回 `noop`，`jobs list` 返回六个任务；MCP 宿主能列出四个工具，并且 CLI 与 MCP lint 的 v1 JSON 领域字段一致。
