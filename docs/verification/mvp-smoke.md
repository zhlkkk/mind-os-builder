# MVP 验证

## 离线质量门

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run test:pack
npm run audit:architecture
npm run audit:release
```

- `npm test`：契约、路径安全、Wiki、Books、采集、Distill、Radar、Research、Jobs、MCP 和 npm tarball E2E。
- `test:pack`：验证规范资产、可选 MCP 与空前缀完整流程。
- `audit:architecture`：核心 TypeScript 非空行不超过 2500、核心依赖不超过三个、无平台运行时符号。
- `audit:release`：源码和 tarball 无 Python 入口、私人绝对路径、疑似凭证、真实 raw 或测试文件。

## 合成烟测

```bash
npm run smoke
```

成功输出 v1 JSON，并列出 doctor、Skills、Wiki、Books、Twitter、RSS、Distill、Research、Radar 和 Jobs。

## 可选真实烟测

```bash
MINDOS_RUN_LIVE=1 npm run test:live
```

运行前用户自行安装并认证 OpenCLI 与 Folo。Book Base 的只读真实校验还需设置 `MINDOS_LIVE_VAULT`。未显式启用时 live 测试跳过，不读取账号或已有 vault。

## 发布检查

- npm tarball 在空前缀安装后可运行 `mindos doctor --json`。
- `--omit=optional` 时核心命令可用且 MCP 返回明确缺失依赖；默认安装时 stdio MCP 可启动。
- 六种宿主 Skill 安装均通过 preview、apply、noop 和冲突保护。
- 生产代码不依赖 Python，不包含内置 Research Provider HTTP 客户端或通用 RSS Parser。
