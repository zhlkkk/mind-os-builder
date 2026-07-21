# 输出与状态契约

`prepare` 只把原始候选、Provider cursor、分类与基线写入当前用户的系统临时目录。临时批次按 vault 隔离、权限为 0700/0600，并在 24 小时后失效；不写 vault，不保存凭证。

`commit` 默认 preview。显式 `--apply` 后，保留项按分类写入：

```text
<vault-root>/<collect.rss.output_directory>/YYYY-MM-DD.md
```

所有候选都进入 `.mindos/collect/seen.json`，Provider cursor 进入 `.mindos/collect/cursors.json`；`.mindos/collect/receipts.json` 只保存批次哈希、首次日期、提交阶段和目标哈希，不保存候选正文。

同一批次重放使用首次提交日期并收敛为 `noop`。批次损坏、过期、跨 vault、基线变化、未知或缺失 ID、非法分类都会阻止提交；失败不会把内容写入第二个日期文件。
