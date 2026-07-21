# 03 Book Base 与 RIA

Book Base 是可选读书模块。它安装 RIA 模板、合成书页和严格限定 `wiki/books` 的 Obsidian Bases 视图，不导入真实书架。

## 前置条件

- 已完成 Core Wiki 初始化。
- 自动测试只需要 Node.js 24；可视验收需要 macOS Obsidian 与 Bases 核心插件。

## 动作

先预演，再安装并校验：

```bash
mindos books init ./my-mind-os --json
mindos books init ./my-mind-os --apply --json
mindos books validate ./my-mind-os --json
```

重复运行不会覆盖已编辑书页。属性和视图约定见 [`docs/modules/books.md`](../modules/books.md)。

## 可见产物

- `templates/book-template.md`：R、I、A 三段式模板。
- `wiki/books/example-book.md`：只含合成内容的示例。
- `wiki/books/books.base`：reading、done 等视图。

## 排错

- `mindos.filesystem.invalid_root`：vault 尚未初始化。
- “保留用户现有文件” warning：同名文件内容不同；工具不会覆盖，请人工比较。
- Obsidian 中没有书页：确认 Bases 已启用，且文件位于 `wiki/books`、扩展名为 `.md`。
- 状态不显示：`status` 只能是 `reading`、`done` 或 `shelved`。

## 完成检查

```bash
mindos books validate ./my-mind-os --json
```

确认 `ok` 为 `true` 且 `data.issue_count` 为 0。随后在 Obsidian 中打开合成 vault，确认修改 `status` 能回写 frontmatter；这一步属于人工 Gate。
