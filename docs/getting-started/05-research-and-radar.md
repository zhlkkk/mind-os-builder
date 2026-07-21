# 05 技术调研与 Tech Radar

技术调研和 Radar 都采用“Agent 判断、CLI 校验提交”。Research 由宿主工具收集与核验证据；Radar 从结构化页面准备复查建议。两者默认 preview。

## Tech Research 前置条件

- 已安装项目 Skills，当前 Agent 能读取 `.agents/skills/tech-research/SKILL.md`。
- 宿主至少有一种能返回可访问 URL 的研究工具，例如内置 Web Search、浏览器、MCP、插件或用户已安装的 CLI。
- 研究工具的安装、认证、Key 和费用由宿主管理，不写入 vault 的 `.mindos/config.yaml`。
- `mindos` CLI 可用；它只校验与提交报告，不联网、不调用模型。

Provider 与各宿主配置边界见 [`docs/providers.md`](../providers.md)。

## 运行 Tech Research

把下面的任务交给 Claude Code、Codex、Pi、Hermes、OpenClaw 或 WorkBuddy：

```text
使用 .agents/skills/tech-research/SKILL.md，以 standard 模式调研“目标主题”。
先探测当前会话可用的研究工具；没有工具就停止。把候选 Markdown 写到 vault 外的系统临时目录，
然后用 mindos research commit 预演。不要直接写 raw/research，也不要把模型输出当作来源。
```

Skill 会依次完成范围定义、能力探测、证据收集、交叉核验、反方审视、综合和报告组装。模式含义：

- `quick`：一轮聚焦检索，快速形成带限制的判断。
- `standard`：多来源核验、替代方案和生产风险。
- `deep`：多轮扩展、追踪原文、实现、案例、时间线和争议。

生成候选后，CLI 先预演：

```bash
mindos research commit ./my-mind-os /系统临时目录/candidate.md \
  --target raw/research/2026-07-21-topic.md --json
```

确认返回的主题、模式、`evidence_status`、来源数、工具数和目标后，再提交：

```bash
mindos research commit ./my-mind-os /系统临时目录/candidate.md \
  --target raw/research/2026-07-21-topic.md --apply --json
```

候选必须位于 vault 外，目标必须是新的 `raw/research/<slug>.md`。同一内容重复提交为 `noop`；同名不同内容返回冲突，必须选择一个明确的新目标，不能覆盖。

## 报告证据契约

frontmatter 必须记录 `version`、`topic`、`mode`、`researched_at`、`evidence_status`、本次真实返回证据的 `tools` 和全部 `sources`。正文必须有标题和“参考来源”，并再次出现每个来源 URL。

关键结论至少需要一个一手来源或两个独立二手来源。只有一种工具、工具部分失败或关键主张未核实时，使用 `evidence_status: partial` 并增加“证据缺口”。全部工具不可用时不生成候选。

## Tech Radar

Radar Skill 使用 `mindos radar prepare` 读取复查日期并生成临时建议，再由 Agent 或用户逐项批准或拒绝。`mindos radar commit` 默认 preview，只有显式 `--apply` 才标记批准项；它不会自动移动、归档页面或修改 `wiki/insights/`。

具体命令和决策文件以 `.agents/skills/radar-review/SKILL.md` 为准。

## 排错

- Research 没有可用工具：在宿主层配置 Web、MCP、插件或 CLI 后重新运行 Skill；不要让 CLI 读取 Key。
- `mindos.input.invalid`：检查 frontmatter、工具、来源 URL、参考来源章节和 `partial` 的证据缺口。
- `mindos.filesystem.protected_path`：候选在 vault 内、目标不属于 `raw/research/`，或路径含符号链接。
- `mindos.state.conflict`：目标已有不同内容；选择新的文件名。
- Radar 的 batch、baseline 或完整覆盖错误：重新 `prepare` 或修正逐项决定。

## 完成检查

确认 `raw/research/` 中的报告与候选字节一致，来源可访问，证据缺口没有被写成事实。Research 和 Radar 的 preview 前后 vault 应保持不变。
