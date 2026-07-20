# 交给 Agent 的安装指令

把下面整段复制给 Claude Code、Codex、Pi、Hermes、OpenClaw 或 WorkBuddy。发布仓库后先把 `<MIND_OS_BUILDER_REPO_URL>` 替换成真实公开地址。

```text
请为我安装 Mind OS Builder：<MIND_OS_BUILDER_REPO_URL>

目标不是导入任何私人知识库，而是安装公开 CLI 和当前 Agent 宿主可识别的开放 Skills。请按下面步骤执行：

1. 将仓库克隆到系统临时目录，先阅读 README.md、AGENTS.md、docs/directory-contract.md、scripts/install_harness.py，以及与你当前宿主对应的 adapters/<宿主>/README.md。
2. 确认仓库中没有要求上传 vault、凭证或私人数据；不要读取我现有的知识库。
3. 用 uv 从本地检出安装 CLI，然后运行 `mindos doctor --json` 和 `mindos job list --json` 验证。
4. 识别你当前属于 codex、claude-code、pi、hermes、openclaw、workbuddy 中的哪一种。不要猜测其他产品路径。
5. 先运行 `python scripts/install_harness.py <宿主> ...` 预演。项目级安装使用当前项目绝对路径；Hermes 使用 user 范围。
6. 如果预演存在 conflicts，停止且不要覆盖。如果没有冲突，再添加 `--apply` 安装，并重复预演确认所有 Skill 都进入 unchanged。
7. 不要初始化或修改任何 vault。只报告 CLI 版本、安装的 Skill、目标路径、验证结果，以及仍需我决定的 vault 新目录。

所有写入都限制在 CLI/Skill 安装范围内；临时检出完成后可以删除。不要创建定时任务，jobs/ 只是可选运行层读取的声明。
```

这段指令故意把“安装工具”和“初始化知识库”分开。前者可自动完成，后者必须由用户提供一个明确的新目录，再从教程的 Core Wiki 步骤开始。
