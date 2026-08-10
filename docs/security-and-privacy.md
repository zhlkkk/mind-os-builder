# 安全与隐私

- vault 根在命令开始时解析；相对路径拒绝遍历、绝对路径和写入途中的符号链接。
- `wiki/insights/` 与 `raw/logseq-import/` 永远不可写；`raw/research/` 只允许 research commit，配置指定的采集目录只允许 collect commit 新增或按日去重合并。
- 写操作默认 preview，显式 `--apply` 后仍在锁内重查基线。
- JSON、Markdown、Provider stdout 和本地状态都有大小或深度限制；公开错误不回显外部 stdout/stderr。
- Agent、网页、订阅和社媒内容全部是不可信输入。提示词不是安全边界，最终由 CLI Schema、路径和完整覆盖规则约束。
- OpenCLI、ego-browser、Folo 和研究工具由用户安装与认证。ego-browser 只继承用户已有的 X 登录态；Token、Cookie、Key 和账号信息不写入 vault 配置、命令参数、采集文件、报告或回执。
- Folo 已读同步默认关闭；开启后也只在 RSS 本地提交完成后修改当前决策批次的条目，不使用 `mark-all-read`，不扩大到未判断内容。
- 初始化生成的 `.gitignore` 默认排除 `.env`、Obsidian 本地状态和日志，但它不是秘密扫描器；提交前仍需执行发布审计并检查 Git 历史。
- 研究候选必须位于 vault 外；报告记录真实工具和 HTTP(S) 来源，没有工具时不得生成伪报告。
- 系统临时批次目录为 `0700`、文件为 `0600`，按用户与 vault 隔离。Twitter Skill 另用 owner、规范 vault、随机 run ID 和阶段 marker 绑定 0700 工作区；只精确清理可信根目录的直接子目录，拒绝符号链接和 marker 不匹配目标。apply 前失败可清理，进入 applying 后保留原 decisions 供恢复与撤回；只有 applied/reverted 且超过 30 天的目录可自动回收。回执不保存候选正文。
- MCP 只使用本地 stdio，启动时固定 vault；stdout 只承载协议。项目没有远程传输或自动工具注册。
- npm 发布前运行架构和发布审计，检查私人绝对路径、凭证形态、Python 残留和 tarball 白名单。
