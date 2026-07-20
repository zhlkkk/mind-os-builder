# 05 技术调研与 Tech Radar

Research 保存 Provider 状态、证据草稿和引用，并明确提示草稿不等于事实。Tech Radar 读取结构化日期生成建议；默认只 dry-run，不自动搬运或归档页面。

## 前置条件

- 离线演示不需要凭证；真实研究 Provider 的凭证只从环境或系统凭证机制读取。
- Radar 页面需要信号等级、标题、最新信号日期和来源日期。

## 动作

```bash
uv run mindos research run ./my-mind-os "MCP 安全边界" \
  --mode quick --endpoint http://127.0.0.1:8000/research --json
uv run mindos radar review ./my-mind-os \
  --page wiki/concepts/tech-radar.md --today 2026-07-20 --json
```

`--endpoint` 是用户自行选择的 JSON Research Provider；也可用 `MINDOS_RESEARCH_ENDPOINT`。确认研究预演后增加 `--apply`。Radar 先保持 dry-run；只有用户确认后才能加 `--apply` 写建议标记，高判断性的页面搬运始终人工执行。

## 可见产物

- `raw/research/<日期>-<主题>.md`：合成研报、Provider 状态、引用和待核查判断。
- Radar dry-run 的 `metrics`：active、near、actions 三类建议。
- dry-run 不修改雷达页，也不写 `wiki/log.md`。

## 排错

- `providers_unavailable`：所有 Provider 均失败；不会生成正式研报。
- `partial`：至少一个 Provider 成功，失败项会进入 warning 和缺口区。
- 取消或超时：保留脱敏 checkpoint 后，用新 run ID 恢复，避免重复已完成的付费调用。
- Radar 没有结果：检查页面路径和 `最新信号: YYYY-MM-DD`。

## 完成检查

```bash
find my-mind-os/raw/research -name '*.md' -maxdepth 1
```

至少应有一份报告。确认报告使用 `example.invalid` 合成引用，Radar 页在 dry-run 前后字节一致。
