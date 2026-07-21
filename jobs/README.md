# Jobs

这里保存可移植的声明式任务。每个 YAML 只声明一种入口：受限的 `mindos` argv 数组，或一个 Skill 路径；同时声明输入、effects、并发、重试和 schedule 提示。

```bash
mindos jobs list --json
mindos jobs show lint --json
```

CLI 只校验和展示，不提供 `jobs run`、线程、取消、恢复或调度器。Claude Code、Codex、Pi、Hermes、OpenClaw、WorkBuddy、cron、launchd 或用户自己的 Agent 可以读取这些文件并选择是否执行。`command` 必须按 argv 传给进程，不能拼成 shell 字符串；写操作仍需运行层显式授权 `--apply`。
