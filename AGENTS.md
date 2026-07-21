# AGENTS.md

## 项目目标

Mind OS Builder 公开个人 Mind OS 的搭建方法、行为契约、合成示例和参考实现，不公开或依赖任何私人 vault。

## 不变量

- 以 Skill 为先：Skills、Agents 与 Jobs 声明工作流；TypeScript CLI 只负责确定性的准备、校验与提交，不引入运行时 Registry、Dispatcher 或 JobRunner；MCP 仅为可选本地适配。
- 默认 dry-run；写入必须显式 apply。
- 不得写入 `raw/logseq-import/` 或 `wiki/insights/`。
- 测试和文档只能使用合成内容，不提交凭证、真实日志、用户目录或私人过滤名单。
- 调度器不是核心依赖；Job 只声明命令或 Skill、输入、副作用、并发、重试和调度提示。

## 验证

- `npm run lint`
- `npm run typecheck`
- `npm run test:contract`
- `npm run build`

在 U8 完成一次性切换前，Python 实现仍是迁移期行为基线，涉及旧实现的改动还必须运行：

- `uv run ruff check .`
- `uv run mypy src`
- `uv run pytest`
- `uv build`
- `uv run python scripts/audit_release.py`
