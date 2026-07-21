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

- `raw/`：人工筛选或 Provider 产出的原始材料。
- `wiki/`：编译知识页、索引和日志。
- `journals/`：日记与 Distill 触发来源。
- `AGENTS.md`、`schema.md`：结构、frontmatter、引用和写入约束。
- 第二次初始化返回 `changed: false`，不会覆盖后续用户内容。

`wiki/insights/` 和 `raw/logseq-import/` 永远不可由自动能力写入。

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
