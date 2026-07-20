# Scripts

- `install_harness.py`：把顶层开放 Agent Skills 安装到指定宿主，默认只预演，`--apply` 才原子提交；Distill 的角色引用在系统临时目录中从 `agents/roles/` 物化。
- `audit_release.py`：扫描工作树和 Git 历史中的私人路径与疑似凭证。

脚本只做仓库维护和接入，不复制 `src/` 中的业务规则。
