---
name: wiki-query
description: 沿本地 Wiki 索引和链接回答问题并保留来源。用于查询已有知识、比较页面观点，或把有价值的结论回流为候选 Wiki 变更。
compatibility: 需要 Python 3.11+、可用的 mindos CLI，以及调用方授予的本地 vault 只读能力；不需要网络。
---

# Wiki Query

1. 运行 `mindos wiki query <vault-root> "<问题关键词>" --json`，从结构化结果定位索引和相关页面。
2. 只在验证或补充来源时读取 `raw/`，不要把未验证素材表述为稳定知识。
3. 回答时列出参考的 Wiki 页面，并区分页面事实、你的综合判断和知识缺口。
4. 若结论值得沉淀，先给出完整候选页面；只有用户确认后才通过 `mindos wiki ingest` 预演并执行回流，不得直接写 vault。
5. 回流完成后运行 `mindos wiki lint <vault-root> --json`。

不得修改 `wiki/insights/` 和 `raw/logseq-import/`，也不得越过调用方声明的 vault 根目录。
