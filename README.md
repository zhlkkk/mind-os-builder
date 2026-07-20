# Mind OS Builder

一套从空目录构建本地个人知识操作系统的方法、契约与参考实现。

项目公开可复用的构建过程，不包含任何人的私人知识库。仓库本身就是可读、可复制的系统骨架；Claude Code、Codex、Pi、Hermes、OpenClaw、WorkBuddy 等外层 Agent 只负责理解和调用它。

## 一眼看懂仓库

```text
.agents/skills/   开放 Agent Skills，仓库中的规范源
agents/           客户端中立的自定义 Agent 与角色契约
adapters/         各 Agent 宿主的接入示例，不放业务逻辑
data/             初始化模板、合成示例与默认配置
docs/             从零教程、方法和架构说明
jobs/             lint、distill、radar、采集等声明式任务
scripts/          安装、审计和验证脚本
src/              mindos CLI、MCP 与确定性领域实现
tests/            单元、契约、集成和完整旅程测试
```

这里使用标准化程度更高的复数目录 `.agents/skills/`，不是 `.agent/skills/`。顶层目录是唯一规范源；构建 wheel 时会把同一份资源带入安装包，不在 `src/` 里维护第二份副本。

## 两种安装方式

安装 CLI：

```bash
git clone MIND_OS_BUILDER_REPO_URL mind-os-builder
uv tool install ./mind-os-builder
mindos doctor --json
```

或者复制 [交给 Agent 的安装指令](docs/install-with-agent.md)，让当前的 Claude Code、Codex、Pi、Hermes、OpenClaw 或 WorkBuddy 完成检查、CLI 安装和 Skill 接入。仓库尚未发布远程地址，因此文档保留 `<MIND_OS_BUILDER_REPO_URL>` 占位符，发布时再替换。

## 当前入口

```bash
uv sync --extra dev
uv run mindos doctor --json
uv run mindos wiki init ./demo-vault --apply --json
uv run mindos books init ./demo-vault --apply --json
uv run mindos wiki lint ./demo-vault --json
uv run mindos job list --json
```

初始化后的 `demo-vault/.mindos/config.yaml` 包含 Tech Research 的非秘密配置；Twitter/OpenCLI、RSS/Folo 和各 Research Provider 的安装、认证与 Key 均由用户预先完成，Builder 不自动接管。

从 [零开始教程](docs/getting-started/00-overview.md) 继续搭建采集、Book Base、Distill、Tech Research、Radar、Agent Skills 与 MCP。

## 设计边界

- CLI 是确定性核心入口；MCP、Agent Skills、自定义 Agent 与 Job 只做标准适配。
- Job 声明描述动作、输入输出、副作用、并发键、重试和时间提示，不绑定 cron、launchd 或某个 Agent 产品。
- 所有写操作默认 dry-run；`--apply` 才会修改目标 vault。
- 私人 vault、凭证和真实采集结果不进入本仓库；发布前执行 `uv run python scripts/audit_release.py .`。

目录契约、架构和安全边界分别见 [docs/directory-contract.md](docs/directory-contract.md)、[docs/architecture.md](docs/architecture.md) 与 [docs/security-and-privacy.md](docs/security-and-privacy.md)。
