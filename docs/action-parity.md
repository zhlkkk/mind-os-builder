# CLI、Job、Skill 与 MCP 一致性

CLI 是确定性行为的唯一实现。Skill 负责语义判断，Job 只声明入口，MCP 只把少量固定工具转发到同一个已发布 `mindos` 子进程。

对于同一次 CLI 与 MCP 调用，`version`、`ok`、`state`、`changed`、`artifacts`、`data` 和稳定 `error` 应逐字段相等。MCP 的 text content 只是同一 JSON 的序列化，不创建第二套领域结果。

随机 batch ID 只在同一次 prepare 内有效；两次独立 prepare 应比较候选、基线和分类等领域数据，不要求 ID 相等。Skill 输出始终经 commit 校验，不能绕过 CLI 直接写 vault。

`collect.rss.commit` 除 `workspace.write` 外声明条件性的 `network.write`：只有 vault 配置显式开启已读同步且调用方执行 `--apply`，才会在本地提交后逐条修改当前批次的 Folo 已读状态。

MCP 映射由 `contracts/mcp-tools.yaml` 手工维护，只暴露 Wiki lint/query/init 和 Books validate。映射或结果 schema 版本漂移会使契约测试失败。Jobs 由两个不导入项目源码的合成宿主验证为相同 argv 或 Skill 输入；`jobs export` 只投影宿主配置，不改变 Job 语义，也不获得执行或写入授权。
