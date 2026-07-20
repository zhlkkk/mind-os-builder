# Agents

这里保存客户端中立的自定义 Agent 契约。

- `orchestrator.md` 定义 Distill 的 scan、角色生成、dry-run、apply 顺序。
- `roles/` 定义 Lumina、Prism、Vector、Nexus、Ember 的输入输出和只读边界。

这些文件不假设 Claude Code、Codex 或其他宿主的专有语法。宿主专用投影只放在 `adapters/`；确定性写入仍由 `mindos distill apply` 完成。
