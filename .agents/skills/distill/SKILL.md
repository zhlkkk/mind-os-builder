---
name: distill
description: 扫描日记中的角色标签并编排 Lumina、Prism、Vector、Nexus、Ember 五类回复。用于预览待提炼段落、生成角色正文和安全追加 Callout。
compatibility: 需要 Python 3.11+ 和可用的 mindos CLI；生成角色回复需要调用方自选的 Agent 或模型能力。
---

# Distill

1. 运行 `mindos distill scan <vault-root> --json`，以返回的稳定触发标识为工作清单。
2. 按中立角色契约生成回复正文：经统一安装器安装后读取本 Skill 的 `references/roles/`；直接在源码仓库使用时读取仓库根目录的 `agents/roles/`。不要让模型直接写文件，也不要改变触发标识或基线摘要。
3. 先运行 `mindos distill apply <vault-root> --responses <responses.json> --json` 预演。
4. 只有用户确认且预演无冲突时，追加 `--apply` 提交。
5. 重复扫描，确认已处理触发不会再次追加；基线变化或锁冲突必须停止并报告。

角色只产出文本，路径校验、幂等、加锁和追加始终交给确定性核心。
