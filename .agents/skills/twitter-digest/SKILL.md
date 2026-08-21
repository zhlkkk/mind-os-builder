---
name: twitter-digest
description: 默认用 OpenCLI、或显式用 ego-browser 备用脚本准备 Twitter 候选，由当前 Agent 完成筛选、必要翻译、分类和摘要，再通过确定性 CLI 校验并提交每日简报时使用。
compatibility: 需要 Node.js 24、可用的 mindos CLI，以及用户预先安装并认证的 opencli；显式使用备用 Provider 时改为需要已登录 X 的 ego-browser。Skill 不安装依赖、不持有模型 Key，也不直接写 vault。
---

# Twitter Digest

下文所有 `scripts/...`、`prompts/...` 和 `references/...` 路径都相对于当前已加载的 twitter-digest Skill 安装目录解析，绝不相对于 vault、仓库或进程当前目录；无法确定 Skill 根目录时必须停止并报告，禁止猜测路径。

1. 检查 `mindos doctor --json` 和 `<vault-root>/.mindos/config.yaml` 中的 `collect.twitter` 配置；完成条件：默认路径的 OpenCLI 可执行，或用户已明确选择且 ego-browser 可执行并继承了 X 登录态；`output_directory`、`daily_filename`、过滤规则和分类表均已确认，任何凭证都没有进入仓库或命令参数。不得因为 OpenCLI 不可用而静默切换 Provider。
2. 运行 `scripts/manage-run-workspace.sh prune <vault-root>`，再运行 `recover <vault-root>`。对每个返回工作区读取 `phase`：若为 applying，必须先读取其中的 `batch-id` 和原 `decisions-twitter-<batch-id>.json`，用同一文件重放 `commit --apply`；完成 noop 重放和只读审计后把它转换为 applied，禁止先发起新采集。若为 created、captured、prepared、reviewed 或 previewed，按 apply 前失败用 `cleanup` 精确清理后再创建新运行；其他阶段、marker 不匹配或无法验证的目录必须停止并报告，不得自动删除。
3. 没有待恢复运行时，用 `scripts/manage-run-workspace.sh create <vault-root>` 创建本次 0700 工作区，并从 `run-<32 位十六进制>` 目录名取得运行 ID。调用方应在 EXIT、INT、TERM 上尽力执行 `cleanup`，但该命令会拒绝删除已经进入 applying、applied 或 reverted 的恢复材料；清理失败不得覆盖主命令状态。
4. 默认运行 `mindos collect twitter prepare <vault-root> --json`；在 macOS 使用 Chrome Adapter 时，必须按 [OpenCLI 窗口清理](references/opencli-window-cleanup.md) 在同一个 shell 进程中包装本次调用，成功或失败后都只关闭本次新建且已释放为空白页的窗口。OpenCLI 会顺序抓取 For You 与 Following 各最多 50 条并按 ID 合并。
5. 只有用户或任务显式选择备用 Provider 时，才运行 `scripts/collect-ego-browser.sh <run-dir>/capture.json <run-id>`，用 `transition ... captured` 确认采集文件，再运行 `mindos collect twitter prepare <vault-root> --provider ego-browser --input <run-dir>/capture.json --json`。脚本会先验证 capture 只能写入匹配 run ID 的受信 created 工作区，再用运行 ID 隔离任务空间；它顺序读取 For You 与 Following 各最多 50 条、过滤广告、按稳定 ID 合并，并在成功或失败后只关闭本任务空间。若页面要求登录、用户接管控制、非自然结束的滚动停滞或没有候选，必须停止并报告，不得改走 OpenCLI。
6. `prepare` 返回后用 `scripts/manage-run-workspace.sh bind <run-dir> <vault-root> <batch-id>` 绑定批次；ego-browser 的 capture 会在此时立即删除。结果必须为 `needs_agent`，保存 `data.batch_id`、`data.baseline_hash`、`data.categories` 和全部 `data.candidates`；Twitter 候选在 Provider 可用时包含 `replies`、`views`、`retweets`、`likes`，缺失指标不得伪造为零。候选为空时不生成决策文件，并精确清理本次工作区。prepare、commit 和 audit 的结构化结果只能直接读取命令 stdout，不得用重定向、tee 或临时文件保存；工作区内不得生成 prepare/audit scratch 或临时检查程序。
7. 对每个候选执行[候选筛选提示词](prompts/select.md)，按[筛选证据量表](references/selection-rubric.md)生成独立中间记录；完成条件：每个 `id` 恰好有一个决定、具体 `reason`、证据等级、理由代码、边界标记和主题指纹。证据等级与保留条数都不能自动决定结果；只有短链、表情或无法确认主题的候选必须拒绝。超过单次上下文容量时按主题分片，但每片必须保留统一尺度摘要与全部边界项。
8. 对所有保留项分别执行[翻译与摘要提示词](prompts/translate-summarize.md)和[分类与标签提示词](prompts/classify.md)；完成条件：每个保留项都有重新表述的展示标题、忠实摘要、明确的 `translated` 和批次分类表中的一个分类键，禁止把原文机械复制到标题和摘要。
9. 对完整批次执行[批次一致性复核](prompts/review-batch.md)，先比较同主题边界决定，再核对翻译忠实度、分类和机械套壳；应用修订并重跑，直到复核输出空数组，然后把工作区转换为 reviewed。不得以改变入选数量为目标。
10. 执行[决策组装提示词](prompts/assemble-decisions.md)，并按[决策文件契约](references/decision-schema.md)写入 `<run-dir>/decisions-twitter-<batch-id>.json`；禁止复用固定临时文件。无人值守宿主若提供原生文件写入工具，必须直接用该工具写最终 decisions；禁止用终端 heredoc、输出重定向、`jq` 生成器、动态 Node/Python 代码或 shell 管道拼装文件，以免触发审批或产生半文件。完成条件：`version`、`batch_id`、`baseline_hash` 和 `id` 原样复制，决定完整覆盖本批次，且所有复核中间字段都已移除。
11. 运行 `mindos collect twitter commit <vault-root> <decisions.json> --json` 预演；完成条件：结果为 `preview` 或 `noop`，`data.quality.valid` 为 true，候选数、保留数、拒绝数和计划产物符合预期，然后把工作区转换为 previewed。若为 `blocked`，按 `error.code` 返回步骤 4、5、9 或 10 修正。
12. 仅在用户确认或已授权的自动任务中，先把工作区转换为 applying，再用同一决策文件运行 `mindos collect twitter commit <vault-root> <decisions.json> --apply --json`。转换后发生的任何失败都必须保留原 decisions 和批次供下次恢复，不得调用 pre-apply cleanup。
13. 用同一决策文件重放 commit，随后运行 `mindos collect twitter audit <vault-root> --date <提交日期> --json`；完成条件：重放和审计都返回 `state: noop`，审计的 `data.quality.valid` 为 true。最后把工作区转换为 applied；原 decisions 在 30 天回执窗口内保留，CLI 候选批次已由成功提交删除。日常任务不得再次实时采集；二次 Provider 采集只用于显式 live smoke。

OpenCLI 默认路径负责双路抓取；ego-browser 备用路径的双路抓取只存在于本 Skill 脚本。CLI 负责规范化、确定性过滤、批次保存、契约校验、去重和落盘，不启动浏览器。筛选、必要翻译、分类与摘要由调用本 Skill 的外层 Agent 完成；Skill 本身不绑定模型、Agent 宿主或调度器。
