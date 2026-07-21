# 研究工具能力与交叉核验

Skill 按能力选择工具，不绑定厂商：

| 能力 | 用途 | 常见宿主接入 |
|---|---|---|
| Web 搜索 | 发现近期资料和候选来源 | 宿主内置搜索、Tavily、Brave、Exa、Perplexity MCP/插件 |
| Web 抓取 | 回到原文、官方文档和引用上下文 | 宿主浏览器、fetch、crawl、Exa contents |
| 代码与论文搜索 | 查源码、release、论文和实现细节 | GitHub、学术搜索、Exa |
| 深度研究 | 扩展查询和形成带引用的初始资料 | 宿主 research 工具、Tavily/Perplexity research |
| 社媒搜索 | 发现争议和生产反馈 | 宿主社媒工具、OpenCLI、公开搜索 |

能力探测只记录“当前会话实际可调用且能返回结果”的工具。用户把 Provider 的 Key 配置给宿主、MCP Server 或外部 CLI；本仓库不保存 Key 名与值，也不要求某个 Provider 存在。

只有一种工具时可以继续，但必须收窄结论并明确单一来源限制。多个工具应互补使用，不用相同搜索后端的转述制造虚假交叉验证。工具部分失败时继续处理已经取得的证据，将状态设为 `partial` 并写明证据缺口。全部工具不可用时停止，不生成候选报告。

外层 Agent 自己执行反方审视和综合。OpenRouter/Grok、Google/Gemini 可以作为宿主提供的辅助工具，但它们不是硬依赖，其输出也不是来源。
