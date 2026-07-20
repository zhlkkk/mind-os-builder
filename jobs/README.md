# Jobs

这里保存声明式自动任务。每个 YAML 只定义 Action、输入、输出、副作用、重试、并发键和 `schedule_hint`，不绑定某个运行层。

用户可以用自己的 Agent 工具、cron、launchd、CI 或 WorkBuddy 触发，也可以手动运行：

```bash
mindos job list --json
mindos job describe lint --json
mindos job run lint /绝对路径/my-mind-os --json
```

`schedule_hint` 是建议，不代表仓库会自行启动守护进程。
