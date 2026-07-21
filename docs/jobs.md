# 声明式 Jobs

Job 是给外部运行层看的版本化 YAML，不是仓库内置的任务引擎。它有两种入口：

- `command`：以 `mindos` 开头的 argv 数组，变量只能引用 `inputs` 中已声明的键。
- `skill`：指向 `.agents/skills/<name>/SKILL.md`，由外层 Agent 执行判断流程。

两者不能同时存在。每个 Job 还声明 `effects`、`single|parallel` 并发提示、最多三次的重试上限和可选 `schedule`。schedule 是人类可读建议，不代表仓库会启动守护进程。

## 查看任务

```bash
mindos jobs list --json
mindos jobs show collect-twitter --json
mindos jobs show tech-research --json
```

CLI 会验证全部内置 YAML、命令是否存在、Skill 是否存在、变量绑定和 shell 元字符，但绝不执行 Job。项目没有 `jobs run`、队列、线程状态、cancel 或 resume。

## 运行层责任

外部运行层需要：读取并验证 YAML；收集 inputs；按 argv 启动命令或让 Agent 使用 Skill；在写操作前取得授权；遵守 effects、并发和重试；消费 v1 CLI JSON。不要把 argv 连接成 shell 字符串，也不要自动追加 `--apply`。

采集 Job 只运行 prepare；收到 `needs_agent` 后，运行层继续调用 Twitter/RSS Skill 生成决策，再独立 preview/apply commit。Distill 与 Radar 同理。Tech Research 是 Skill Job，因为能力探测、交叉核验和综合属于 Agent，不属于 CLI。

当前六个 Job：Wiki lint、Twitter、RSS、Distill、Tech Radar 和 Tech Research。它们可以由任意 Agent、cron、launchd、CI 或桌面自动化解释，仓库不要求具体调度器。
