---
name: wiki-ingest
description: 将用户提供的本地素材编译为相互链接的 Wiki 页面。用于新增概念页、更新索引和变更日志，并在提交前验证 Wiki 约束。
compatibility: 需要 Python 3.11+、可用的 mindos CLI，以及调用方授予的本地 vault 文件访问能力；不需要网络。
---

# Wiki Ingest

1. 先运行 `mindos wiki query <vault-root> "<主题>" --json`，并读取 vault 根目录的 `AGENTS.md` 与 `schema.md` 理解现有结构。
2. 只处理用户明确指定的素材；保持一个概念一个页面，并使用完整 YAML frontmatter 和 `[[wikilinks]]`。
3. 把完整候选页面保存到临时文件；不得直接写 vault。页面路径只可位于 `wiki/concepts/`、`wiki/entities/` 或 `wiki/connections/`。
4. 先运行 `mindos wiki ingest <vault-root> <页面路径> <候选文件> --json` 预演；只有用户明确确认后才追加 `--apply` 提交。更新已有页面时通过 `--expected-hash` 携带读取版本的 SHA-256。
5. 运行 `mindos wiki lint <vault-root> --json`，根据结构化错误修复问题。

不要假设任何特定 Agent 客户端、子代理 API 或权限语法存在。
