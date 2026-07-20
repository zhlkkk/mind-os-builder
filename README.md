# Mind OS Builder

一套从空目录构建本地个人知识操作系统的方法、契约与参考实现。

项目公开可复用的构建过程，不包含任何人的私人知识库。核心能力通过 `mindos` CLI 提供，MCP、Agent Skills、自定义 Agent 和声明式 Job 都建立在同一领域契约上。

## 当前入口

```bash
uv sync --extra dev
uv run mindos doctor --json
uv run mindos wiki init ./demo-vault --apply --json
uv run mindos wiki lint ./demo-vault --json
```

完整教程与模块说明位于 `docs/`。
