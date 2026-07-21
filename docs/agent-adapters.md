# Agent 适配器

规范 Skills 位于 `.agents/skills/`。Claude Code、Codex、Pi、Hermes、OpenClaw 与 WorkBuddy 通过各自原生目录发现同一套 Skill；业务流程不复制到适配器。

```bash
mindos skills install codex --scope project --project /绝对路径/项目 --json
mindos skills install codex --scope project --project /绝对路径/项目 --apply --json
```

安装器默认 preview，不覆盖冲突目录。Distill 的安装副本会在规范 reference 之外物化 `agents/roles/`，让 Skill 离开仓库后仍可使用五角色契约。六种宿主路径见 [`adapters/`](../adapters/README.md)。

## MCP stdio

MCP 是可选本地适配器：

```bash
mindos mcp serve /绝对路径/my-mind-os
```

启动时固定 vault；工具参数不能换根目录。默认安装包含可选 MCP SDK，使用 `npm install --omit=optional` 时核心 CLI/Skills 仍可用，`mcp serve` 会返回 `mindos.dependency.unavailable`。

第一版只暴露 `mindos_wiki_lint`、`mindos_wiki_query`、`mindos_books_validate` 和 `mindos_wiki_init`。stdio stdout 只承载协议；工具通过子进程调用同一 CLI，写入仍需显式 `apply: true`。没有自动 Registry、远程 transport、resources、任务状态或模型调用。
