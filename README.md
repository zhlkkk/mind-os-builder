# Mind OS Builder

一套从空目录构建本地个人知识操作系统的方法、契约与参考实现。

项目公开可复用的构建过程，不包含任何人的私人知识库。核心能力通过 `mindos` CLI 提供，MCP、Agent Skills、自定义 Agent 和声明式 Job 都建立在同一领域契约上。

## 当前入口

```bash
uv sync --extra dev
uv run mindos doctor --json
uv run mindos wiki init ./demo-vault --apply --json
uv run mindos books init ./demo-vault --apply --json
uv run mindos wiki lint ./demo-vault --json
uv run mindos job list --json
```

从 [零开始教程](docs/getting-started/00-overview.md) 继续搭建采集、Book Base、Distill、Tech Research、Radar、Agent Skills 与 MCP。

## 设计边界

- CLI 是确定性核心入口；MCP、Agent Skills、自定义 Agent 与 Job 只做标准适配。
- Job 声明描述动作、输入输出、副作用、并发键、重试和时间提示，不绑定 cron、launchd 或某个 Agent 产品。
- 所有写操作默认 dry-run；`--apply` 才会修改目标 vault。
- 私人 vault、凭证和真实采集结果不进入本仓库；发布前执行 `uv run python scripts/audit_release.py .`。

架构和安全边界分别见 [docs/architecture.md](docs/architecture.md) 与 [docs/security-and-privacy.md](docs/security-and-privacy.md)。
