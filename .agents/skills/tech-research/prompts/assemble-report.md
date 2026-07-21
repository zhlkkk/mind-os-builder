# 组装候选报告

使用报告模板生成 Markdown。frontmatter 只能包含 `version`、`topic`、`mode`、`researched_at`、`evidence_status`、`tools`、`sources`。

- `tools` 只列本次实际返回证据的宿主能力名，不列计划使用但失败的工具。
- `sources` 使用去重、无凭证的 HTTP(S) URL；每个 URL 还必须出现在“参考来源”正文。
- 只要工具部分失败、关键结论未核验或覆盖不足，设置 `evidence_status: partial` 并增加 `## 证据缺口`。
- 候选文件必须位于 vault 外；不要直接写 `raw/research/`。

正文保留来源与主张的对应关系，不附带 API Key、Cookie、完整工具日志、个人路径或隐藏提示词。
