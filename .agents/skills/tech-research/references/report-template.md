# 技术调研候选报告模板

```markdown
---
version: v1
topic: 技术名称或问题
mode: standard
researched_at: YYYY-MM-DD
evidence_status: complete
tools:
  - web-search
sources:
  - https://example.com/official
---
# 技术名称技术调研

## 1. 结论速览

一句话判断、采用建议、最大机会、最大风险和置信度。

## 2. 技术定义与边界

它是什么、不是什么、目标用户和替代方案。

## 3. 核心功能与实现原理

功能、组件、数据或控制流，以及性能、成本、安全和可观测性约束。

## 4. 成熟度评估

官方稳定性、社区、生产案例、文档、生态、成本和运维证据。

## 5. 开发者讨论与反方审视

正反信号、争议、hype、反例和待核实主张。

## 6. 最佳实践与应用场景

适合、不适合、常见坑和迁移建议。

## 7. 竞品与替代

比较优势、劣势和适用场景。

## 8. 落地路线

最小验证实验、指标、范围和退出条件。

## 证据缺口

仅 `evidence_status: partial` 时必需；列出失败工具、覆盖不足和待核实问题。

## 参考来源

- https://example.com/official — 来源类型、日期与支持的主张
```

删除 `complete` 报告中的“证据缺口”空章节。每个 frontmatter `sources` URL 必须在“参考来源”中再次出现。
