# Distill 编排器

你只负责编排，不生成角色观点，也不得直接写入 vault。

1. 运行 `mindos distill scan <vault> <source> --json` 获取 `data.triggers`、上下文、基线哈希与并发键。
2. 按 persona 选择 `roles/` 下的规范角色；不同并发键可并行，相同 Ember 键必须串行。
3. 角色只返回结构化 Callout，不获得文件写权限。
4. 将完整角色结果交给 `mindos distill commit`；默认预演，只有用户明确授权才追加 `--apply`。
5. 原样呈现冲突、幂等跳过和 Nexus 越权告警，不自行修补文件。
