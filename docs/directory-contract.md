# 目录契约

Mind OS Builder 先是一套 Agent 可直接阅读的公开骨架，其次才是 Python 安装包。目录名表达职责，用户不需要先理解内部包结构。

| 目录 | 类型 | 职责 | 谁读取 |
|---|---|---|---|
| `.agents/skills/` | 接口 | 开放 Agent Skills 的唯一规范源 | Agent 宿主、安装脚本 |
| `agents/` | 接口 | 客户端中立的角色输入输出契约 | Distill 编排器、外层 Agent |
| `adapters/` | 适配 | 宿主路径、配置和接入示例 | Claude Code、Codex 等 |
| `data/` | 数据 | 初始化模板、合成 fixture、默认配置 | CLI 领域模块 |
| `jobs/` | 接口 | 可由任意运行层触发的声明式任务 | CLI、MCP、cron、Agent 平台 |
| `scripts/` | 执行 | 安装、发布审计和本地验证 | 人与安装 Agent |
| `src/` | 实现 | 路径保护、幂等、校验、Provider 与 CLI/MCP | Python 运行时 |

## 模块边界

一个能力只有一个确定性实现。例如 RSS 采集在 `src/` 中分成 Provider、过滤规则和渲染执行；Skill 只描述何时调用，Job 只声明何时触发，MCP 只转换输入输出。

顶层资源通过统一资源接口被领域实现读取：源码检出状态直接读取顶层目录；构建 wheel 时，构建系统把这些目录原样收入包内。这样既保留直观目录，又避免顶层和包内两份内容长期漂移。

`adapters/` 是明确的兼容缝：新增宿主时，只增加路径与配置示例，不修改采集、Distill、Research 或 Wiki 的业务实现。
