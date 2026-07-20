# Book Base 与 RIA 读书页

Book Base 是可选模块，它在已初始化的 vault 中安装三个资产：RIA 书页模板、合成示例书页和 Obsidian `books.base`。它不依赖微信读书，也不自动导入个人书架。

## 书页契约

每页至少包含 `title`、`author`、`status`、`domain`、`sources`、`created`、`updated` 和 `tags`。`status` 只能是 `reading`、`done` 或 `shelved`；日期使用 `YYYY-MM-DD`。`started` 和 `finished` 可为空，但非空时也必须使用该格式。

正文按 RIA 分为原始阅读触动、自己的内化和可验收的应用，并保留与 Wiki 其他页面的反向连接区。

## 安全与幂等

初始化只创建缺失文件。同名文件已存在时，无论内容是否与内置资产相同，都不会覆盖；内容不同会返回告警。dry-run 只报告计划产物，不创建目录或文件。

`books.base` 的顶层过滤固定为 `wiki/books` 目录和 Markdown 扩展名，并排除点文件、`density-tracker` 及 `*.runtime.md`。校验命令是只读的；如果运行态 Markdown 被放进 `wiki/books`，它会报错而不会修改文件。

## Obsidian 验收

自动化测试只验证 YAML、过滤和书页契约。首次发布前还需在 macOS Obsidian 中打开合成 vault，确认“正在读”与“已读完”视图匹配正确，且修改 `status` 能回写书页 frontmatter。live 测试默认跳过，由显式环境变量启用。
