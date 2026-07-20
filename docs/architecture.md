# 架构

`mind_os_builder` 由共享应用服务与确定性领域模块组成。CLI 是稳定自动化入口；MCP、Skills、自定义 Agent 和外部调度器读取同一 Action Registry，不复制领域逻辑。

写任务遵循 preflight、work、validate、promote、report 生命周期。中间数据进入系统临时目录，只有显式 apply 才能提升到用户 vault。
