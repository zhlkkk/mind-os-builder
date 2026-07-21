# Mind OS Builder

从空目录构建本地个人知识系统的方法、Skills、声明式 Jobs 与确定性 TypeScript CLI。项目公开的是搭建过程和标准接口，不包含任何人的私人知识库。

## 仓库结构

```text
.agents/skills/   工作流、判断规则、独立 prompts 与 references
agents/           客户端中立的角色契约
adapters/         Claude Code、Codex、Pi、Hermes、OpenClaw、WorkBuddy 接入
contracts/        CLI、Agent 决策、Job 与 MCP 的 v1 Schema
data/             Wiki、Book Base 与默认配置模板
docs/             从零教程、架构、安全和 Provider 前置条件
jobs/             任意运行层可解释的 command/skill YAML
scripts/          TypeScript 烟测与发布审计
src/              mindos CLI 的确定性准备、校验和提交
tests/            契约、单元、集成、npm tarball E2E 与可选 live 测试
```

顶层目录是唯一规范源。npm 包携带同一批资产，不在 `src/` 维护副本。

## 安装

需要 macOS 与 Node.js 24 LTS：

```bash
npm install -g mind-os-builder
mindos doctor --json
```

尚未发布 npm 时，从仓库安装：

```bash
git clone <MIND_OS_BUILDER_REPO_URL> mind-os-builder
cd mind-os-builder
npm ci
npm run build
npm install -g .
```

也可以把 [`docs/install-with-agent.md`](docs/install-with-agent.md) 整段发给当前 Agent，让它安装 CLI 并接入宿主原生 Skill 目录。

## 从零初始化

所有写操作默认 preview：

```bash
mindos skills install codex --scope project --project /绝对路径/项目 --json
mindos skills install codex --scope project --project /绝对路径/项目 --apply --json
mindos wiki init ./demo-vault --json
mindos wiki init ./demo-vault --apply --json
mindos books init ./demo-vault --apply --json
mindos wiki lint ./demo-vault --json
```

继续阅读 [`docs/getting-started/00-overview.md`](docs/getting-started/00-overview.md)，依次跑通 Twitter/OpenCLI、RSS/Folo、Distill、Tech Research、Radar、Jobs 和可选 MCP。

## 核心边界

- CLI 不调用模型；Agent 负责筛选、翻译、摘要、角色回复、研究综合和人工决定。
- Twitter 只依赖用户预装的 OpenCLI；RSS 完全依赖用户预装的 Folo CLI，项目不自动安装或认证。
- Tech Research 使用宿主已有的 Web、MCP、插件或 CLI；Provider Key 不进入项目配置。
- Job 只声明 argv 或 Skill，不提供执行器和调度器。
- MCP 是可选本地 stdio 适配器，只静态转发四个 CLI 原语。
- `raw/logseq-import/` 与 `wiki/insights/` 不可写；Agent 输出始终先经 CLI 校验。

## 开发验证

```bash
npm ci
npm test
npm run test:pack
npm run audit:architecture
npm run audit:release
```

`npm run smoke` 使用合成 Provider 完成完整离线旅程。真实 OpenCLI、Folo 和 Obsidian 只在用户显式设置 `MINDOS_RUN_LIVE=1` 时测试。
