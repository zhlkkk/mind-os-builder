# Action 跨适配器一致性

CLI、MCP、Agent Skill、Job 和用户自己的 Agent 运行层必须汇聚到同一个 Action 调度接口。适配器可以改变展示方式，不能复制过滤、写入、幂等或审批规则。

对相同 Action、vault、参数和 apply 模式，以下领域字段必须相等：

- `api_version`、`task`、`status`、`reason_code` 与 `changed`；
- `artifacts`、`warnings`、`errors` 与 `metrics`；
- 稳定退出码所代表的成功、部分成功、阻塞和失败语义。

`run_id` 在同一次共享调用中保持一致；独立重试可以生成新值。人类可读摘要、MCP content block 或客户端 UI 文案不属于领域一致性契约。

契约测试使用合成夹具直接比较共享命令服务与 MCP 内存调用的字典结果。Skill 只声明相同 CLI/JSON 调用，不用脆弱的端到端提示词测试替代领域结果比较。

Wiki 的稳定原语同样遵循这一边界：`wiki.query` 只做本地确定性检索；`wiki.ingest` 接收已经编译完成的单页内容，通过 `WriteGuard`、dry-run/apply、版本哈希和统一 Action 同步页面、索引与日志。知识抽取与答案综合属于 Agent 层，不在适配器中重复实现。
