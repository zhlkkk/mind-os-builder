---
name: wiki-ingest
description: 将用户提供的本地素材编译为相互链接的 Wiki 页面。用于新增概念页、更新索引和变更日志，并在提交前验证 Wiki 约束。
compatibility: 需要 Python 3.11+、可用的 mindos CLI，以及调用方授予的本地 vault 文件访问能力；不需要网络。
---

# Wiki Ingest

1. 读取 vault 根目录的 `AGENTS.md`、`schema.md` 和 `wiki/index.md`。
2. 只处理用户明确指定的素材；保持一个概念一个页面，并使用完整 YAML frontmatter 和 `[[wikilinks]]`。
3. 不修改 `raw/logseq-import/` 或 `wiki/insights/`。新增页面时同步更新 `wiki/index.md`，并把变更追加到 `wiki/log.md`。
4. 写入前展示候选变更；只有用户明确确认后才使用调用方提供的本地文件能力提交。
5. 运行 `mindos wiki lint <vault-root> --json`，根据结构化错误修复问题。

不要假设任何特定 Agent 客户端、子代理 API 或权限语法存在。
