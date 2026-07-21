# 架构

项目是 Skill-first 的薄确定性内核：工作流和提示词在 `.agents/skills/`，CLI 只做可重复的准备、输入校验、路径保护、原子写入、锁和幂等提交。

```text
Skills / Agents ── 语义判断 ──┐
Jobs ───────────── 声明入口 ──┼──> mindos CLI ──> vault / 系统临时目录
MCP ────────────── 静态转发 ──┘
外部 CLI / Web / MCP ──> 候选与证据
```

`.agents/skills/`、`agents/`、`data/`、`docs/`、`jobs/` 是人能直接阅读的规范层。npm tarball 只打包这些目录和编译后的 CLI。

## 分阶段工作流

- Twitter/RSS：Provider CLI → prepare → Agent 筛选、翻译、摘要、分类 → commit。
- Distill：scan → 五角色 Agent 回复 → commit。
- Radar：prepare → 人工 approve/reject → commit。
- Tech Research：宿主工具取证与核验 → vault 外候选 Markdown → research commit。

跨 Agent 的批次按当前用户和 vault hash 隔离到系统临时目录。采集与 Radar 批次默认 24 小时失效；精简回执只保存 hash、日期、阶段和目标，用于部分写入恢复，不保存候选正文。

## 写入模型

所有写命令默认 preview，显式 `--apply` 后在操作级锁内重新校验基线。单文件通过同目录临时文件、fsync 和原子发布写入。多文件采集使用精简回执形成可恢复逻辑事务，不宣称物理多文件原子性。

Jobs 不执行，MCP 不生成领域能力，Skills 不直接写 vault。运行层可以替换，CLI JSON 与文件结果保持不变。
