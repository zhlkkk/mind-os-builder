---
name: wiki-query
description: 查询本地 Wiki 并沿索引与链接综合回答。用户要检索已有知识、比较页面观点，或把结论回流为候选 Wiki 页面时使用。
compatibility: 需要 Node.js 24、可用的 mindos CLI，以及调用方授予的本地 vault 只读能力；不需要网络。
---

# Wiki Query

1. 运行 `mindos wiki query <vault-root> "<query>" --json`；完成条件：已记录 `data.matches` 中每个命中页面和摘录，`state: noop` 被明确识别为没有命中。
2. 从 `wiki/index.md` 开始读取命中页面并沿相关 `[[wikilinks]]` 扩展；仅在核验来源时读取 `raw/`；完成条件：每项结论都有 Wiki 页面、原始素材或“知识缺口”三类归属之一。
3. 回答时分开呈现页面事实、综合判断和知识缺口，并列出参考页面；完成条件：每个可验证主张都能追溯到已列出的页面。
4. 用户要求沉淀结论时，调用 `wiki-ingest` Skill，通过 `mindos wiki ingest` 完成候选、预演、确认和 lint；完成条件：用户未确认时 vault 保持不变，确认后索引、日志与 lint 结果全部通过。

文件访问必须限制在调用方声明的 vault 根目录内；`wiki/insights/` 和 `raw/logseq-import/` 保持只读。
