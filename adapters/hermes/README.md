# Hermes

Hermes 已确认的本地 Skill 目录是用户级 `~/.hermes/skills/`，因此安装器不猜测项目级私有路径：

```bash
python scripts/install_harness.py hermes --scope user
python scripts/install_harness.py hermes --scope user --apply
```

发布到 GitHub 后，也可以把某个 `SKILL.md` 的公开直链交给 `hermes skills install`。多个 Mind OS Skills 建议使用本仓库安装器整体安装，避免漏掉能力。

安装方式见 [Hermes 官方快速开始](https://hermes-agent.nousresearch.com/docs/getting-started/quickstart/)。
