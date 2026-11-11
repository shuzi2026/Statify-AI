# Statify AI 工作入口

本仓库是 Statify 的独立 Web 工程。目录和启动方式见 README.md。用户 Agent 与开发 Agent 的设计在此工程内另行讨论。

- 行动结算查 src/engine.ts，计划查 src/planning.ts，规则参数查 shared/rules/。
- 存档查 shared/save-schema.ts、src/migrate.ts 与 src/storage.ts，业务写入走现有事务入口。
- 素材以 assets/素材/catalog.json 为准。由脚本生成 Web 副本，不维护第二份图片源。
- 开发使用 README.md 登记的独立区域入口和合成存档。账号、数据库、支付沙箱与模型凭据按区域配置。
- 先完成与改动相关的检查，再汇报实现及验证。提交、公开和发布以任务授权为准。
