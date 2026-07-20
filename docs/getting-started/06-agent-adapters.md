# 06 Agent、MCP 与自动任务适配

CLI、MCP、Agent Skills 和 Job 都是同一 Action Registry 的适配入口。业务规则只存在于 Python 领域核心，任何入口都不能复制过滤、路径保护或幂等逻辑。

## 前置条件

- 已跑通离线完整旅程。
- 使用 MCP 时安装项目的 `mcp` 可选依赖，并固定本地 stdio 与 vault 根目录。
- 使用 Agent Skills 时，客户端需支持开放 Agent Skills 目录约定。

## 动作

1. 从 `mind_os_builder/assets/skills/` 复制所需 Skill 完整目录。
2. MCP 宿主启动时注入固定 vault 根目录和共享 `ActionDispatcher`。
3. 自动任务读取 `mind_os_builder/assets/jobs/*.yaml`，或运行参考示例：

```bash
uv run mindos job list --json
uv run mindos job describe lint --json
uv run mindos job run lint ./my-mind-os --json
uv run python examples/run_lint_job.py --vault ./my-mind-os --json
```

Job 的 `schedule_hint` 只是提示。你可以使用已有 Agent、cron、launchd 或其他平台触发，也可以完全手动运行；项目不要求安装任何调度器。

需要 MCP 时，以固定 vault 根目录启动 stdio：

```bash
uv run mindos mcp serve ./my-mind-os
```

`status`、`cancel` 和 `resume` 只存在于同一进程内的长驻 `JobRunner` 参考接口；首版没有虚构跨进程状态存储的 CLI 命令。

## 可见产物

- Skill 通过 `mindos ... --json` 调用稳定契约。
- MCP 暴露 Action tools 与 capability、jobs、config、run summary resources。
- Job 结果仍是同一个 `RunEnvelope`，包含 run ID、状态、产物、告警、错误和指标。
- 不同入口对相同 Action 的领域字段一致。

## 排错

- MCP 启动失败：确认安装 `mcp>=1.27,<2`，且 transport 为 stdio。
- MCP 路径被拒绝：vault 根目录只能在启动时固定，请求参数不能逃逸。
- Job 为 `config_error`：Action 未注册或 Job ID 不存在。
- Agent 尝试直接写文件：调整 Skill，让它调用 Action；提示词不是安全边界。
- 自动任务没有按时运行：Job 本身不含调度器，请检查你选择的外部触发工具。

## 完成检查

```bash
uv run python examples/run_lint_job.py --vault ./my-mind-os --json
```

确认返回 `status: succeeded`。再比较 CLI、MCP 或 Agent 对同一 lint Action 的 `status`、`changed`、`artifacts` 和 `metrics`。
