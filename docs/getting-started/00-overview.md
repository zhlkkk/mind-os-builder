# 从零构建个人 Mind OS

教程从一个空目录开始，最终得到 Wiki、Book Base、采集、Distill、Research、Radar、Jobs 和 Agent 接入。合成测试不读取已有知识库，也不要求真实账号。

## 前置条件

- macOS。
- Node.js 24 LTS 与 npm。
- Git，以及一个明确的新目录。

## 安装与自检

```bash
git clone <MIND_OS_BUILDER_REPO_URL> mind-os-builder
cd mind-os-builder
npm ci
npm run build
node lib/src/cli.js doctor --json
```

发布后也可直接 `npm install -g mind-os-builder`。

## 先跑离线证明

```bash
npm run smoke
```

它使用临时 vault、合成 OpenCLI/Folo 可执行文件和合成 Agent 决策，跑通 doctor、Skills、Wiki、Books、Twitter、RSS、Distill、Research、Radar 与 Jobs，不访问真实账号。

## 学习路径

- L0：[`01 Core Wiki`](01-core-wiki.md)，理解 `raw`、`wiki`、`journals` 与只读区。
- L1：[`02 Collection`](02-collection.md) 与 [`03 Books`](03-books.md)。
- L2：[`04 Distill`](04-distill.md) 与 [`05 Research/Radar`](05-research-and-radar.md)。
- L3：[`06 Agent Adapters`](06-agent-adapters.md)，安装 Skills、读取 Jobs 或启用 MCP。

第一版只负责新建或明确接管的目录，不自动合并现有 vault。所有写入先 preview，再显式 apply。
