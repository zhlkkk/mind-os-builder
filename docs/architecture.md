# 架构

仓库先以顶层目录表达系统，再由 `mind_os_builder` Python 包提供确定性执行。CLI 是稳定自动化入口；MCP、Skills、自定义 Agent 和外部调度器读取同一 Action Registry，不复制领域逻辑。

```text
.agents/skills ─┐
agents ─────────┼─> 外层 Agent 编排 ─┐
jobs ───────────┘                    │
                                    ├─> Action Registry ─> 领域模块 ─> vault
CLI ────────────────────────────────┤
MCP ────────────────────────────────┘
data ────────────────────────────────────────────────^ 初始化与模板
```

顶层 `.agents/skills/`、`agents/`、`jobs/`、`data/` 是唯一规范源。统一资源接口在源码检出时读取这些目录，在 wheel 中读取构建时收入的 `_bundle/`；后者是分发产物，不是第二个维护入口。

写任务遵循 preflight、work、validate、promote、report 生命周期。中间数据进入系统临时目录，只有显式 apply 才能提升到用户 vault。
