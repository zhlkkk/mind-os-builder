# 02 Twitter 与 RSS 采集

采集模块把来源访问与业务规则分开：Provider 只 fetch 并返回游标；公共管线负责 Normalize、Filter、可选 Review、Render、Validate 与 Promote。离线 fixture 是基线，真实 Provider 是可替换能力。

## 前置条件

- 已初始化并通过 lint 的 vault。
- 先阅读 [`docs/providers.md`](../providers.md)中的稳定与实验边界。
- 本章离线路径不需要网络或凭证。

## 动作

先查看供自定义适配器使用的参考 YAML，再用合成 Twitter fixture 预演和提升。当前 CLI 使用显式参数，不会静默读取这份 YAML：

```bash
sed -n '1,200p' examples/config/collect.yaml
uv run mindos collect twitter ./my-mind-os \
  --fixture examples/synthetic-vault/fixtures/twitter.json --json
uv run mindos collect twitter ./my-mind-os \
  --fixture examples/synthetic-vault/fixtures/twitter.json \
  --output raw/collect/twitter-brief.md --apply --json
```

通用 RSS/Atom 使用一个或多个 feed；首次先省略 `--apply`：

```bash
uv run mindos collect rss ./my-mind-os \
  --feed https://example.com/feed.xml \
  --output raw/collect/rss-brief.md --json
```

不希望访问网络时，运行 `examples/offline_full_journey.py`，它使用内存 RSS 和合成 Twitter。自定义 Agent 或运行层通过 Action 参数传入参考 YAML 中的确定性过滤项，而不是把规则塞进 Provider 或提示词。

## 可见产物

- `raw/collect/twitter-brief.md` 与 `raw/collect/rss-brief.md`。
- JSON `metrics` 中包含 fetched、normalized、filtered、reviewed、rendered 计数。
- 每个丢弃项都有 include、exclude、score 或 output limit 原因。
- `.mindos/collect/cursors.json` 只在验证和提升成功后更新。

## 排错

- `unavailable`：实验 CLI 未安装；改用 fixture 或通用 RSS/Atom。
- `authentication`、`rate_limited`、`budget_exhausted`：不要重试到失控，先处理认证或预算。
- `invalid_json`：外部 CLI 契约变化；保留错误码，不把原始输出写进 vault。
- `validation_failed`：缺少合法来源 URL 或引用；游标不会前移，可修复后安全重试。
- LLM 不可用：选择带 warning 的启发式降级，或配置为失败关闭。

## 完成检查

```bash
test -f my-mind-os/raw/collect/twitter-brief.md
```

打开简报，确认每条信号都有来源链接。RSS 预演确认后加 `--apply` 再检查对应文件。真实 Provider 留到发布烟测，不要放进 CI。
