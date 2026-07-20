# 从零构建个人 Mind OS

这套教程公开的是搭建方法、行为契约和合成示例，不是任何人的私人知识库。你会从一个空目录开始，逐层启用能力；没有 Twitter、LLM 或 Obsidian 凭证时，核心和离线示例仍然可用。

## 学习路径

- L0：初始化 LLM Wiki，并理解 `raw`、`wiki`、`journals` 与只读区。
- L1：用离线 fixture 跑采集，启用 RIA Book Base。
- L2：用五角色 Distill、假研究 Provider 和 Tech Radar dry-run 形成闭环。
- L3：把同一 Action 接到 CLI、MCP、Agent Skills 或自己的运行工具。

## 前置条件

- macOS；核心 Python 代码不依赖 macOS 专属接口，但首个完整烟测只认证 macOS。
- Python 3.11+、Git 和 `uv`。
- 一个新目录；不要把教程直接指向已有 Obsidian vault。

## 动作

```bash
git clone https://github.com/OWNER/mind-os-builder.git mind-os-builder
cd mind-os-builder
uv sync --extra dev
uv run mindos doctor --json
```

把命令中的 `OWNER` 替换为发布后的 GitHub 组织或用户名。

先运行完整离线证明，可以确认本机安装、wheel 资源和所有模块能够协作：

```bash
uv run python examples/offline_full_journey.py --vault ./demo-vault --json
```

## 可见产物

- 命令输出一个带 `status` 和各步骤状态的 JSON 对象。
- `demo-vault/` 中出现 Wiki、两份采集简报、Book Base、五角色日记回复和合成研究报告。
- 不会读取已有 vault，不要求网络、API key 或真实账号。

## 排错

- `uv` 不存在：按 [uv 官方安装文档](https://docs.astral.sh/uv/getting-started/installation/)安装后重试。
- `doctor` 报必需项缺失：先修复 Python 或文件系统能力；可选 Provider 缺失不阻塞 L0。
- 目标目录已有文件：换一个空目录。第一版不负责合并已有 vault。

## 完成检查

```bash
test -f demo-vault/AGENTS.md
test -f demo-vault/wiki/index.md
test -f demo-vault/raw/collect/twitter-brief.md
test -f demo-vault/wiki/books/books.base
```

四个检查均返回 0 后，继续 [01 Core Wiki](01-core-wiki.md)。
