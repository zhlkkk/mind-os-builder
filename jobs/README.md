# Jobs

这里保存可移植的声明式任务。每个 YAML 只声明一种入口：受限的 `mindos` argv 数组，或一个 Skill 路径；同时声明输入、effects、并发、重试和 schedule 提示。

```bash
mindos jobs list --json
mindos jobs show lint --json
mindos jobs export lint --adapter cron --input vault=/绝对路径/Mind-OS --executable /绝对路径/mindos --json
```

CLI 只校验、展示并生成适配配置，不安装或执行任务，也不提供 `jobs run`、线程、取消、恢复或调度器。`jobs export` 支持 `cron`、`launchd` 和通用 `agent`；系统调度器只接收 command Job，Skill Job 交给 Agent。`command` 必须按 argv 传给进程；写操作仍需运行层显式授权 `--apply`。完整说明见 [`docs/jobs.md`](../docs/jobs.md)。
