# Scripts

- `smoke.ts`：在系统临时目录运行完整合成旅程。
- `audit-architecture.ts`：限制核心 TypeScript 行数、依赖和禁止平台符号。
- `audit-release.ts`：扫描公开源码与 npm tarball 的私人路径、凭证形态和禁止文件。

脚本通过 `npm run smoke`、`npm run audit:architecture` 和 `npm run audit:release` 执行，不复制领域业务规则。
