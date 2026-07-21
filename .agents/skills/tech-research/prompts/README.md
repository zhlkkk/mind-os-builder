# Tech Research 提示词模块

按顺序使用：

1. `scope.md`：定义问题、模式与停止条件。
2. `gather-evidence.md`：调用宿主工具收集可追溯证据。
3. `cross-check.md`：交叉核验主张。
4. `adversarial-review.md`：寻找反例、hype 与生产风险。
5. `synthesize.md`：综合成熟度、场景和实验。
6. `assemble-report.md`：组装 CLI 可校验的候选报告。

提示词由外层 Agent 执行。CLI 不读取本目录，也不在生产代码中复制提示词。
