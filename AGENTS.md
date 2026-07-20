# AGENTS.md

## 项目目标

Mind OS Builder 公开个人 Mind OS 的搭建方法、行为契约、合成示例和参考实现，不公开或依赖任何私人 vault。

## 不变量

- Python 领域核心是唯一业务实现；CLI、MCP、Skills 和 Agent 配置只做适配。
- 默认 dry-run；写入必须显式 apply。
- 不得写入 `raw/logseq-import/` 或 `wiki/insights/`。
- 测试和文档只能使用合成内容，不提交凭证、真实日志、用户目录或私人过滤名单。
- 调度器不是核心依赖；Job 只声明 Action、参数、副作用和调度提示。

## 验证

- `uv run ruff check .`
- `uv run mypy src`
- `uv run pytest`
- `uv build`
- `uv run python scripts/audit_release.py`
