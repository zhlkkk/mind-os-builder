# 目录契约

Mind OS Builder 先是一套 Agent 可直接阅读的公开骨架，其次才是 npm 安装包。目录名表达职责，用户不需要先理解内部包结构。

| 目录 | 类型 | 职责 | 谁读取 |
|---|---|---|---|
| `.agents/skills/` | 接口 | 开放 Agent Skills 的唯一规范源 | Agent 宿主、安装脚本 |
| `agents/` | 接口 | 客户端中立的角色输入输出契约 | Distill 编排器、外层 Agent |
| `adapters/` | 适配 | 宿主路径、配置和接入示例 | Claude Code、Codex 等 |
| `data/` | 数据 | 初始化模板、合成 fixture、默认配置 | CLI 领域模块 |
| `jobs/` | 接口 | 可由任意运行层触发的声明式任务 | CLI、MCP、cron、Agent 平台 |
| `scripts/` | 执行 | 安装、发布审计和本地验证 | 人与安装 Agent |
| `src/` | 实现 | TypeScript 薄 CLI 的路径保护、校验和确定性提交 | Node.js 运行时 |

## 模块边界

一个能力只有一个确定性实现。Skill、Agent 与 Job 声明工作流和交接；`src/` 只承载命令行需要的确定性路径保护、输入校验和提交。MCP 只转换本地输入输出，不拥有独立业务逻辑。

顶层资源通过统一资源接口被 CLI 和 Agent 宿主读取：源码检出状态直接读取顶层目录；构建 npm 包时，发布清单把公开资源原样收入包内。这样既保留直观目录，又避免顶层和包内两份内容长期漂移。

`adapters/` 是明确的兼容缝：新增宿主时，只增加路径与配置示例，不修改 Skill、Agent、Job 或 CLI 的职责边界。
