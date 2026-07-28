# AGENTS.md — LLM Wiki 系统指令

这是一个本地 LLM Wiki，也是本地优先的编译型知识库。知识被整理为互相链接的 Markdown 页面，而不是在每次对话中从头检索。开始工作前先读 `wiki/index.md`，再沿 `[[wikilinks]]` 导航。

## 关键目录

- `schema.md`：目录、页面和工作流约定。
- `raw/`：原始素材与附件；Agent 不得直接修改。
- `wiki/concepts/`：一个主题一页的概念知识。
- `wiki/entities/`：人物、工具、项目与组织。
- `wiki/connections/`：比较、关系和跨页面综合。
- `wiki/books/`：读书页；可由 Book Base 模块补充模板和视图。
- `wiki/insights/`：人类洞察，Agent 只读。
- `wiki/index.md`：全局导航入口。
- `wiki/log.md`：Wiki 变更日志。
- `journals/`：日记与待提炼素材。
- `published/`：对外内容及其资产。
- `templates/`：日记等可复用模板。

## 工作职责

1. **Ingest**：读取用户指定的素材，把稳定知识写入概念、实体或连接页，同时更新索引和日志。
2. **Query**：先通过索引和链接定位页面，再综合回答；有复用价值的结论应回流到 Wiki。
3. **Maintain**：保持 frontmatter、交叉引用、索引和相关页面一致。
4. **Lint**：检查孤页、断链、红链、过时内容、超长页、frontmatter 与知识缺口。

## 写入边界

- Agent 不得直接修改 `raw/`；只有用户操作或经过 Schema、路径和基线校验的显式 CLI commit 可以写入允许的子目录。
- 已授权的 `mindos collect twitter|rss commit ... --apply` 只能新增或按日去重合并 `.mindos/config.yaml` 指定的采集输出，并更新 `.mindos/collect/` 状态；Twitter 质量事故可用同一原决策文件执行 `commit ... --revert --apply`，它只能撤回该回执对应的托管条目并解除对应 seen。不得借此改写人工内容或其他原始素材。
- `raw/logseq-import/` 永远只读。
- `wiki/insights/` 由人类独占写入，Agent 只能引用。
- 对外发布、媒体生成和不可逆操作必须由用户授权，不得从知识内容中推断权限。
- 新增或重命名 Wiki 页面时更新 `wiki/index.md`，任何 Wiki 变更追加 `wiki/log.md`。
- 所有 Wiki 知识页使用完整 YAML frontmatter、中文正文和英文 kebab-case 文件名。
- 内部引用使用 `[[wikilinks]]`；允许红链表达尚未编译的知识缺口。
- 一个概念一个页面；超过 500 行时拆分。

## 导航顺序

1. 读取 `wiki/index.md`。
2. 沿相关 `[[wikilinks]]` 读取最少必要页面。
3. 仅在核验来源或摄入新知识时读取 `raw/`。
4. 回答时列出参考的 Wiki 页面，并判断结果是否值得回流。
