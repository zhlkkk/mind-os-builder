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

## 导出到运行宿主

`jobs export` 只生成可审查内容，返回状态始终是 `preview`；它不写配置、不调用 `crontab` 或 `launchctl`，也不启动 Agent。所有声明的输入都必须通过可重复的 `--input key=value` 显式绑定。

先取得全局安装后的绝对路径：

```bash
command -v mindos
```

命令型 Job 可以生成 cron 行：

```bash
mindos jobs export lint \
  --adapter cron \
  --input vault=/绝对路径/Mind-OS \
  --executable /绝对路径/mindos \
  --json
```

也可以生成 macOS launchd plist：

```bash
mindos jobs export collect-twitter \
  --adapter launchd \
  --input vault=/绝对路径/Mind-OS \
  --executable /绝对路径/mindos \
  --json
```

生成内容位于 `.data.export.content`，建议先用 `jq -r '.data.export.content'` 提取到临时文件并人工检查，再由用户自己的安装方式合并到 crontab 或 `~/Library/LaunchAgents/`。CLI 不会覆盖现有调度配置。

cron 支持 Job 自带的 `hourly`、`daily`、`twice-monthly`，也接受 `--schedule '0 9 * * 1-5'` 形式的五段数字表达式。launchd 只接受这三个预设。`manual` Job 必须显式覆盖 schedule，或交给 Agent 按需触发。

Skill Job 必须导出为通用 Agent 任务：

```bash
mindos jobs export distill \
  --adapter agent \
  --input vault=/绝对路径/Mind-OS \
  --input source=journals/2026-07-22.md \
  --json
```

产物符合 [`contracts/agent-job.schema.json`](../contracts/agent-job.schema.json)，包含解析后的 command 或 skill、effects、并发、重试和 schedule。`execution.mode` 固定为 `host-controlled`，`apply_authorized` 固定为 `false`：外层 Agent 仍需按自己的权限模型决定执行和写入。使用 Skill Job 前，应先用 `mindos skills install <host>` 把 Skills 安装到目标宿主。

| Adapter | command Job | skill Job | 是否安装或执行 |
|---|---:|---:|---:|
| `cron` | 是 | 否 | 否 |
| `launchd` | 是 | 否 | 否 |
| `agent` | 是 | 是 | 否 |

## 运行层责任

外部运行层需要：读取并验证 YAML；收集 inputs；按 argv 启动命令或让 Agent 使用 Skill；在写操作前取得授权；遵守 effects、并发和重试；消费 v1 CLI JSON。不要把 argv 连接成 shell 字符串，也不要自动追加 `--apply`。

采集 Job 只运行 prepare；收到 `needs_agent` 后，运行层继续调用 Twitter/RSS Skill 生成决策，再独立 preview/apply commit。Distill 与 Radar 同理。Tech Research 是 Skill Job，因为能力探测、交叉核验和综合属于 Agent，不属于 CLI。

当前六个 Job：Wiki lint、Twitter、RSS、Distill、Tech Radar 和 Tech Research。自带 Adapter 只解决配置形态转换；安装、运行状态、日志、通知和卸载仍由 cron、launchd、CI、桌面自动化或用户自己的 Agent 工具负责。
