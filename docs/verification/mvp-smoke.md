# macOS MVP 烟测记录

本文件区分已自动证明的离线能力与首次公开发布前必须由维护者完成的真实 Gate。不得把真实返回原文、用户名、凭证或用户目录写入报告。

## 环境

- 平台：macOS
- Python：3.11+
- 测试 vault：每次由系统临时目录新建
- 私人 vault：禁止读取
- 报告日期：2026-07-20

## 自动离线证明

| 检查 | 命令 | 状态 | 证据 |
|---|---|---|---|
| wheel 完整旅程 | `uv run pytest tests/e2e/test_full_journey.py -q` | 已通过 | wheel 安装后完成 Wiki、采集、Books、五角色 Distill、Research、Radar、Job |
| 非 live 测试 | `uv run pytest -m "not live"` | 已通过 | 140 passed、5 deselected，只使用合成夹具 |
| 静态质量 | `uv run ruff check . && uv run mypy src` | 已通过 | Ruff 无错误；65 个源码文件通过 mypy |
| 构建 | `uv build` | 已通过 | wheel 与 sdist 构建成功，wheel 已用于隔离 E2E |
| 发布审计 | `uv run python scripts/audit_release.py` | 已通过 | 无私人路径、凭证或未允许文件 |

## 真实 Gate

| Gate | 状态 | 只记录这些字段 | 不得记录 |
|---|---|---|---|
| Twitter Provider | 已完成 dry-run | OpenCLI、succeeded、20 条 | 用户名、帖子原文、认证数据 |
| 通用 RSS/Atom | 已完成 dry-run | 1 个公开 feed、succeeded、20 条 | 私有 feed URL 查询参数、原文 |
| Obsidian Book Base | 待执行 | 视图是否正确、status 是否回写 | 私人书架或笔记 |
| 五角色 Distill | 离线已通过，真实 Agent 待执行 | 五个角色是否触发、幂等结果 | 真实日记正文 |
| Tech Research | 待执行 | Provider 成功/失败、引用数 | key、付费请求原文 |
| Tech Radar | 离线 dry-run 已通过 | scanned/active/near/actions | 私人雷达标题和来源 |
| Job 参考运行层 | 离线已通过 | Job ID、状态、run ID 是否存在 | 外部调度器凭证 |
| MCP stdio | 已完成 | 14 tools、4 resources、`wiki_init` 成功 | 协议 stdout 原文、vault 内容 |

## 真实执行步骤

```bash
MINDOS_RUN_LIVE=1 uv run pytest tests/live/test_live_mvp.py -q
```

测试必须自己创建并清理临时 vault。需要人工完成的认证、系统权限弹窗和 Obsidian 操作不能自动绕过。

## 发布签署

- [ ] 所有真实 Gate 完成，失败限制已记录。
- [ ] 合成 vault 已人工检查，不含真实知识内容。
- [ ] wheel、sdist 和准备推送的 Git 文件通过发布审计。
- [ ] 开源许可证、仓库名称和真实 Provider 使用条款已由仓库所有者确认。

当前限制：Windows/Linux 未做真实认证；Folo 与 OpenCLI 是实验 Adapter；已有 vault 自动迁移、远程 MCP 和正式调度器适配不在首版范围内。
