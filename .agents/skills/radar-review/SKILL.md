---
name: radar-review
description: 准备技术雷达到期建议，组织 Agent 与用户逐项批准或拒绝，并安全提交已批准标记。用户要复查 Radar 日期、层级或建议动作时使用。
compatibility: 需要 Node.js 24+ 和 mindos CLI；人工确认不需要网络。
---

# Radar Review

CLI 根据结构化日期准备候选并验证提交；是否接受建议由 Agent 与用户决定。CLI 不移动、归档页面，也不修改 `wiki/insights/`。

1. 运行 `mindos radar prepare <vault> --page <wiki/page.md> --today <YYYY-MM-DD> --json`；`--page` 可重复，也可改用 `--hub <wiki/index.md>` 解析 Wikilink。
2. 检查 `data.diagnostics` 中的缺日期、未来日期和已标记项，再逐项向用户展示 `data.suggestions` 的页面、层级、日期、年龄与建议动作。
3. 严格按 [决策契约](references/decision-schema.md) 为每个 suggestion 生成一次 `approve` 或 `reject`。不得遗漏，也不得在决定中提供目标路径或替代动作。
4. 运行 `mindos radar commit <vault> <decisions.json> --json` 预演。全拒绝返回 `noop`；基线或批次冲突时停止并重新 prepare。
5. 用户确认后追加 `--apply`。CLI 只在获批条目的原页面加入建议标记；相同决定重放返回 `noop`。

批次只短期保存在按用户与 vault 隔离的系统临时目录。不要复制旧批次到另一个 vault，也不要让 Agent 直接编辑 Radar 页面。
