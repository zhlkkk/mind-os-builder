# 架构

项目把工作流和提示词放在 `.agents/skills/`，让 CLI 保持精简。CLI 只处理可重复验证的准备、输入校验、路径保护、原子写入、锁和幂等提交。

```text
Skills / Agents ── 语义判断 ──┐
Jobs ───────────── 声明入口 ──┼──> mindos CLI ──> vault / 系统临时目录
MCP ────────────── 静态转发 ──┘
外部 CLI / Web / MCP ──> 候选与证据
```

`.agents/skills/`、`agents/`、`data/`、`docs/`、`jobs/` 都是可直接阅读的公开资源。npm tarball 只打包这些目录和编译后的 CLI。

## 模块与扩展边界

项目用少量稳定接口隔离具体实现。新增能力应沿现有边界扩展，不要增加全局注册中心：

| 边界 | 接口 | 适配器或实现 | 适合扩展什么 |
|---|---|---|---|
| 语义工作流 | `SKILL.md`、独立 prompts、结构化决策 Schema | 任意支持 Agent Skills 的宿主 | 新判断流程、角色、研究方法 |
| 外部数据 | 固定 argv、规范化记录与稳定错误码 | OpenCLI、Folo CLI，后续显式 Provider | 新数据来源 |
| 确定性提交 | `mindos ... prepare/commit --json` | TypeScript CLI 模块 | 校验、路径保护、锁、幂等写入 |
| 可复用任务 | `jobs/*.yaml`、`jobs export` | cron、launchd、Agent 平台 | 调度提示、重试、并发策略与宿主配置转换 |
| Agent 宿主 | 规范 Skill 与 CLI JSON | `adapters/<host>/` | 新宿主的发现路径与配置 |
| 工具协议 | `contracts/mcp-tools.yaml` | 本地 stdio MCP | 需要工具调用的宿主 |
| 产品层 | CLI JSON、Job、MCP、文件结果 | 未来桌面端、Web 或托管控制面 | 安装、预览、授权、运行记录与可视化 |

同一扩展边界至少出现两个真实适配器后，再考虑抽象通用接口。首个实现保持局部；第二个实现出现时再提取共同契约，避免把 CLI 做成 Registry、Dispatcher 或通用工作流引擎。

## 分阶段工作流

- Twitter/RSS：Provider CLI → prepare → Agent 筛选、翻译、摘要、分类 → commit。
- Distill：scan → 五角色 Agent 回复 → commit。
- Radar：prepare → 人工 approve/reject → commit。
- Tech Research：宿主工具取证与核验 → vault 外候选 Markdown → research commit。

跨 Agent 的批次按当前用户和 vault hash 隔离到系统临时目录。采集与 Radar 批次默认 24 小时失效；精简回执只保存 hash、日期、阶段和目标，用于部分写入恢复，不保存候选正文。

## 写入模型

所有写命令默认 preview，显式 `--apply` 后在操作级锁内重新校验基线。单文件通过同目录临时文件、fsync 和原子发布写入。多文件采集使用精简回执形成可恢复逻辑事务，不宣称物理多文件原子性。

Jobs 本身不执行任务；Job Adapter 只把声明转换成 cron、launchd 或 Agent 配置。MCP 不实现新的领域能力，Skills 不直接写 vault。更换运行层不会改变 CLI JSON 和文件结果。

## 未来知识应用的公共接口

内容生产和其他知识图谱应用共用一套接口，不再分别建设运行时：

```text
vault / link graph
  -> 带来源与基线 hash 的 Knowledge Pack
  -> Agent 生成结构化决策或 Artifact Spec
  -> CLI preview / validate / commit
  -> 内容、媒体资产或其他应用结果
```

Knowledge Pack 隐藏 Markdown、wikilink、frontmatter 和未来图存储之间的读取差异；Artifact Manifest 统一记录输入知识、提示词或模板版本、外部 Adapter、输出文件与 hash。调用方只需要理解这两个接口，不需要知道知识如何存储或媒体如何生成。

Skill 和 Agent 负责生成文本、卡片、图片、音频和视频；CLI 负责文件命名、来源引用、批次基线、Schema、资产清单、路径保护、幂等和提交；图像、语音、视频和发布平台通过 Adapter 接入。同类能力出现两个真实 Adapter 后，再提取公共接口。

详细演进方案见 [`knowledge-applications.md`](knowledge-applications.md)。

## 产品化边界

桌面端或 Web 界面可以提供安装向导、依赖诊断、配置编辑、批次预览、diff 审批、定时任务接入和运行历史，但不能改变职责分工：用户持有 vault，Agent 完成语义判断，CLI 校验写入。产品层只调用现有接口，不复制核心逻辑。

远程同步、团队协作、账号计费或托管调度如果以后出现，应作为独立模块接入，并明确网络、付费调用和外部状态副作用。详见 [`evolution-roadmap.md`](evolution-roadmap.md)。
