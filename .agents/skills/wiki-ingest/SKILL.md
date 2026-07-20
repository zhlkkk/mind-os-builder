---
name: wiki-ingest
description: 摄入本地素材并编译为相互链接的 Wiki 页面。用户要新增或更新概念、实体、连接页面，并同步索引与变更日志时使用。
compatibility: 需要 Python 3.11+、可用的 mindos CLI，以及调用方授予的本地 vault 文件访问能力；不需要网络。
---

# Wiki Ingest

1. 运行 `mindos wiki query <vault-root> "<topic>" --json`，并读取 vault 根目录的 `AGENTS.md` 与 `schema.md`；完成条件：相关已有页面、页面分区和必需 frontmatter 字段均已确认。
2. 把用户指定素材编译成一个完整候选页面，保持一个概念一个页面并使用 `[[wikilinks]]`；完成条件：路径位于 `wiki/concepts/`、`wiki/entities/` 或 `wiki/connections/`，文件名为 kebab-case，frontmatter 字段齐全。
3. 把候选页面写入系统临时目录；更新已有页面时同时计算读取版本的 SHA-256；完成条件：候选文件位于 vault 外，且更新操作已准备 `--expected-hash <sha256>`。
4. 运行 `mindos wiki ingest <vault-root> <page-path> <candidate.md> --json` 预演，更新时追加 `--expected-hash <sha256>`；完成条件：`status` 为 `succeeded`、`reason_code` 为 `dry_run` 或 `noop`，且 `artifacts` 只包含候选页、`wiki/index.md` 和 `wiki/log.md`。
5. 用户确认预演后，用相同命令追加 `--apply`，随后运行 `mindos wiki lint <vault-root> --json`；完成条件：摄入成功、`metrics.error_count` 为 `0`，并能从索引导航到新页面。

素材范围必须限制为用户明确指定的输入，候选内容必须写入系统临时目录；不得直接写 vault。公共流程只依赖 `mindos` 契约，不依赖特定 Agent 客户端或权限语法。
