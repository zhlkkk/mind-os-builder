# 01 Core Wiki

核心 Wiki 是唯一必需模块。它把原始素材、人类日记和编译后的知识页分开，并用 `AGENTS.md` 与 `schema.md` 固定维护规则。

## 前置条件

- 已完成 [00 概览](00-overview.md)中的安装。
- 准备一个不存在或内容为空的目录。

## 动作

先预演，再显式写入：

```bash
mindos wiki init ./my-mind-os --json
mindos wiki init ./my-mind-os --apply --json
mindos wiki lint ./my-mind-os --json
```

第二次 apply 应为幂等操作：

```bash
mindos wiki init ./my-mind-os --apply --json
```

## 可见产物

- `raw/articles|papers|books|assets/`：通用原始材料与附件目录。
- `raw/logseq-import/`：历史导入，只读。
- `wiki/concepts|entities|connections|books/`：概念、实体、关系和读书页。
- `wiki/insights/`：人类洞察，Agent 只读。
- `journals/`：日记与 Distill 触发来源。
- `published/assets/`：对外内容及其图片、卡片、音视频和附件。
- `templates/daily-note.md`：不含个人内容的日记模板。
- `.gitignore`：默认排除凭证、Obsidian 本地状态、系统文件和生成报告，但不忽略 `.agents/`。
- `AGENTS.md`、`schema.md`：结构、frontmatter、引用和写入约束。
- 第二次初始化返回 `changed: false`，不会覆盖后续用户内容。

Twitter、RSS、Tech Research 等能力在首次提交时按需创建自己的 `raw/` 子目录；核心模板不预设私人数据源列表。`.assets/`、编辑器配置、Agent 客户端配置、个人脚本和 `skills-lock.json` 不属于 vault 核心结构。

`wiki/insights/` 和 `raw/logseq-import/` 永远不可由自动能力写入。Agent 也不能直接写入其他 `raw/` 目录，只能把结构化决策交给受支持的 CLI commit。

## 排错

- `mindos.state.conflict`：目标目录不是空目录；不要用强制覆盖，改用新目录。
- `mindos.filesystem.protected_path`：路径包含不安全跳转或符号链接。
- lint 报 `frontmatter_missing`：按 `schema.md` 补齐 YAML，而不是关闭检查。
- lint 报红链 warning：这是待编译线索，不一定阻塞；先确认拼写是否正确。

## 完成检查

```bash
mindos wiki lint ./my-mind-os --json
```

确认 `ok` 为 `true`、`data.error_count` 为 0，并能从 `wiki/index.md` 导航到示例概念页。
