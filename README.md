# Mind OS Builder

这个项目提供一套从空目录搭建本地个人知识系统的方法，包括 Skills、声明式 Jobs 和 TypeScript CLI。仓库只公开搭建过程与标准接口，不包含任何人的私人知识库。

## 快速开始

### 1. 安装 CLI

需要 macOS、Node.js 24 LTS 和 npm。当前可从源码安装：

```bash
git clone https://github.com/zhlkkk/mind-os-builder.git
cd mind-os-builder
npm ci
npm run build
npm install -g .
```

npm 包发布后，可以直接安装：

```bash
npm install -g mind-os-builder
```

检查版本、系统环境和可选外部工具：

```bash
mindos --version
mindos doctor --json
```

### 2. 初始化第一个知识库

先预演 Wiki 初始化，确认目标路径后再写入：

```bash
mindos wiki init ./my-mind-os --json
mindos wiki init ./my-mind-os --apply --json
mindos wiki lint ./my-mind-os --json
```

需要管理书籍和阅读笔记时，再初始化 Book Base：

```bash
mindos books init ./my-mind-os --apply --json
```

初始化后，从 `my-mind-os/AGENTS.md` 和 `my-mind-os/wiki/index.md` 开始使用知识库。

### 3. 让 Agent 使用 Skills

把 `codex` 换成 `claude-code`、`pi`、`openclaw` 或 `workbuddy`。先预演安装，再添加 `--apply`：

```bash
mindos skills install codex --scope project --project /绝对路径/my-mind-os --json
mindos skills install codex --scope project --project /绝对路径/my-mind-os --apply --json
```

Hermes 使用用户级安装。六种宿主的路径和参数见 [`docs/getting-started/06-agent-adapters.md`](docs/getting-started/06-agent-adapters.md)。你也可以把 [`docs/install-with-agent.md`](docs/install-with-agent.md) 整段发给当前 Agent，让它完成 CLI 和 Skills 安装。

## CLI 使用方式

业务命令返回统一的 v1 JSON，`--help` 和 `--version` 保持人类可读。JSON 中的 `state` 表示结果：

- `preview`：已校验，尚未写入。
- `applied`：写入完成。
- `noop`：目标已经是期望状态。
- `needs_agent`：CLI 已准备材料，等待 Agent 判断。
- `blocked` 或 `failed`：检查 `error.code` 和 `error.message`。

写命令先返回 `preview`。确认结果后添加 `--apply`，CLI 才会修改知识库。采集、Distill 和 Radar 采用两阶段流程：CLI 先 prepare 或 scan，Agent 完成语义判断，CLI 再校验并 commit。

| 目标 | 命令 |
|---|---|
| 查看全部命令 | `mindos --help` |
| 检查环境 | `mindos doctor --json` |
| 初始化、检查 Wiki | `mindos wiki init`、`mindos wiki lint` |
| 查询、摄入知识 | `mindos wiki query`、`mindos wiki ingest` |
| 初始化、检查 Book Base | `mindos books init`、`mindos books validate` |
| 采集 Twitter、RSS | `mindos collect twitter`、`mindos collect rss`（RSS 已读恢复用 `recover`） |
| 运行 Distill | `mindos distill scan`、`mindos distill commit` |
| 提交研究、审阅雷达 | `mindos research commit`、`mindos radar prepare`、`mindos radar commit` |
| 安装 Skills | `mindos skills install <host>` |
| 查看或导出任务 | `mindos jobs list`、`mindos jobs export` |
| 启动本地 MCP | `mindos mcp serve <vault>` |

运行 `mindos <command> --help` 查看参数。完整教程从 [`docs/getting-started/00-overview.md`](docs/getting-started/00-overview.md) 开始，按顺序覆盖 Wiki、采集、Books、Distill、Research、Radar、Jobs 和 MCP。

## 当前状态

当前版本已用 TypeScript CLI 和 Skills 跑通 Wiki、采集、Book Base、Distill、Tech Research、Radar、Jobs、六种 Agent 宿主安装与可选 MCP。所有能力共用一套文件和 CLI 契约。仓库已删除旧 Python 实现、迁移脚本和旧运行时 fixture；历史方法记录在 [`docs/legacy-system.md`](docs/legacy-system.md)。

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

CLI 和 Agent 宿主都直接读取顶层目录中的资源。npm 包发布同一批文件，`src/` 不再维护副本。

## 理解与扩展项目

- [`docs/architecture.md`](docs/architecture.md)：当前模块、接口和写入模型。
- [`docs/directory-contract.md`](docs/directory-contract.md)：顶层目录为何就是公开接口。
- [`docs/providers.md`](docs/providers.md)：OpenCLI、ego-browser、Folo 与研究工具的前置条件。
- [`docs/knowledge-applications.md`](docs/knowledge-applications.md)：基于知识库与知识图谱的内容流水线和应用模型。
- [`docs/evolution-roadmap.md`](docs/evolution-roadmap.md)：扩展能力、分发形态和产品化路线。
- [`docs/legacy-system.md`](docs/legacy-system.md)：旧体系保留了哪些方法、删除了哪些实现。

## 核心边界

- CLI 不调用模型；Agent 负责筛选、翻译、摘要、角色回复、研究综合和人工决定。
- Twitter 默认依赖用户预装的 OpenCLI；显式备用路径可使用已登录 X 的 ego-browser Skill 脚本。RSS 完全依赖用户预装的 Folo CLI。项目不自动安装或认证这些工具；RSS 可显式开启提交后的逐条已读同步，默认关闭。
- Tech Research 使用宿主已有的 Web、MCP、插件或 CLI；Provider Key 不进入项目配置。
- Job 只声明 argv 或 Skill；CLI 可生成 cron、launchd 或通用 Agent 配置，但不安装、不执行，也不提供调度器。
- MCP 是可选本地 stdio 适配器，只静态转发四个 CLI 原语。
- `raw/logseq-import/` 与 `wiki/insights/` 不可写；Agent 输出始终先经 CLI 校验。

扩展项目时，优先新增 Skill、契约、显式适配器或 Job；只有跨宿主都需要、可以确定性验证的行为才进入 CLI。未来桌面端、Web 控制台或托管产品也应调用这些稳定接口，不在产品层复制领域实现。

## 开发验证

```bash
npm ci
npm test
npm run test:pack
npm run audit:architecture
npm run audit:release
```

`npm run smoke` 使用合成 Provider 跑通完整离线流程。只有设置 `MINDOS_RUN_LIVE=1` 后，测试才会访问真实的 OpenCLI、Folo 和 Obsidian；ego-browser 使用独立的 `MINDOS_RUN_EGO_LIVE=1` 开关。
