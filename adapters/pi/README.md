# Pi

Pi 的项目级 Skill 目录是 `.pi/skills/`，用户级目录是 `~/.pi/agent/skills/`：

```bash
python scripts/install_harness.py pi --scope project --project /绝对路径/目标项目
python scripts/install_harness.py pi --scope project --project /绝对路径/目标项目 --apply
```

也可以使用 `--scope user` 安装到用户级目录。Pi 读取 Skill 后调用 `mindos ... --json`；业务能力不改写成 Pi 扩展。

路径约定见 [Pi 官方仓库与文档](https://github.com/badlogic/pi-mono)。
