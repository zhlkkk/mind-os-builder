# 旧体系与清理原则

Mind OS Builder 来自一套已经运行过的私人 Mind OS，但公开仓库不复制私人 vault，也不维护旧运行时的兼容实现。这里保留方法来源和迁移结论，代码只保留当前架构。

## 保留下来的方法

- 编译型 LLM Wiki：原始材料进入 `raw/`，稳定知识进入互相链接的 `wiki/`。
- CLI 准备、外层 Agent 判断、CLI 提交：模型不进入确定性脚本。
- Twitter 与 RSS 的抓取、过滤、翻译摘要、分类、按日去重分阶段完成。
- Distill 使用五个角色，但扫描、定位、锁和幂等由确定性核心负责。
- Tech Research 依赖宿主已有 Web、MCP、插件或 CLI，并保留来源与证据状态。
- Job 只描述任务，不绑定某个调度器。

## 已删除的实现

- Python 核心、Python CLI、Provider Runtime 和脚本内模型调用。
- 运行时 Action Registry、Dispatcher、JobRunner 与通用 Provider Factory。
- 私人路径、真实过滤规则、账号信息、历史日志和真实内容 fixture。
- 迁移期的行为语料、重复采集配置和未被当前教程或测试使用的 Provider fixture。

这些内容不会以兼容目录、隐藏脚本或测试快照继续存在。需要理解迁移原因时阅读本文和 Git 历史；需要验证当前行为时运行当前契约测试、离线完整旅程和发布审计。

## 为什么不提供兼容层

旧体系把工作流、模型调用、Provider、写入和调度混在脚本中。兼容层会迫使新架构继续暴露旧参数和旧状态，使每个新能力同时维护两套接口。当前项目选择文件与 CLI 契约作为唯一接口，通过文档帮助迁移，而不是让旧实现长期参与运行。

## 迁移到当前体系

1. 在新目录初始化 Wiki，不直接接管私人仓库。
2. 把业务过滤规则迁移到 `.mindos/config.yaml`，不迁移凭证。
3. 在 Agent 宿主安装规范 Skills，把语义提示词留在 Skill 中。
4. 通过 `prepare` 获取候选，由 Agent 生成结构化决策，再用 `commit` 预演和提交。
5. 用 `jobs/*.yaml` 接入自己的调度器；不要迁移旧的执行器代码。

发布边界、保护目录和验证命令以 [`architecture.md`](architecture.md)、[`security-and-privacy.md`](security-and-privacy.md) 与 README 为准。
