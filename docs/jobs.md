# 声明式 Jobs

`mind-os-builder` 把自动任务定义为版本化 YAML，而不是绑定某个 cron、桌面 Agent 或云调度器。Job 描述动作、输入输出、副作用、并发键、超时、重试、成功状态、能力与密钥要求；`schedule_hint` 和 `timezone` 只是给外部运行层的提示。

## 运行模型

任意运行层都可以读取 Job Catalog，再把 `action` 交给自己的 Command Registry。项目自带的 `JobRunner` 是同步参考实现，不解析 cron，也不负责安装系统定时任务。默认模式来自 `default_mode`，所有写任务都应先 dry-run；显式传入 `apply=True` 才允许对应 command service 写入。

同一 `concurrency_key` 的任务串行执行，不同键可以并行。键可以引用输入，例如 `vault:{root}:wiki`。参考运行层提供 `start`、`status`、`wait`、`cancel` 和 `resume`，但线程中的 Python 函数不能被强制终止：超时只改变对外状态，取消只保证尚未开始的任务，`close` 仍会等待已开始的函数结束。需要硬超时、跨进程恢复或强制取消时，外层工具必须采用进程隔离或自己的运行时；Job YAML 仍是双方共享的契约。

## 自适配

已有 Agent 工具无需采用参考 runner。它只需：加载并验证 YAML；按 Registry 绑定 `action`；尊重 `default_mode`、能力、密钥和并发键；把结果归一为 `RunEnvelope`。调度周期、凭证注入、进程隔离和通知机制均由用户选择的运行层决定。

内置目录包含 lint、distill、tech-radar、Twitter/RSS 采集与 tech-research 六个 Job。`tech-radar` 接收 `pages` 或 `hub`，因此 Radar 拆成月度页面后无需修改执行代码。
