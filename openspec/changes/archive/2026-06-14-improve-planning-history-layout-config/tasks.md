## 1. 后端配置与数据模型

- [x] 1.1 添加 `.env.example`，包含 `GREEN_AGENT_DATABASE_URL` 和 `GREEN_AGENT_DB_PATH` 示例，并保持真实 `.env` 不提交
- [x] 1.2 引入 `python-dotenv` 依赖，并在 `app.main` 读取数据库环境变量前加载项目根目录 `.env`
- [x] 1.3 为 `PlanningRecordSummary` 增加 `title` 字段，并新增 `PlanningRecordRenameRequest`
- [x] 1.4 为 SQLite 和 MySQL 的 `planning_records` schema 增加 `title` 列
- [x] 1.5 实现启动时兼容迁移，给旧 `planning_records` 表补充 `title` 列和默认标题

## 2. 后端规划历史行为

- [x] 2.1 保存规划记录时生成默认 `title`，并在列表、详情、恢复响应中返回
- [x] 2.2 实现 `KnowledgePool.rename_planning_record(record_id, title)`，校验非空标题并保持规划快照不变
- [x] 2.3 新增 `PATCH /api/planning-records/{record_id}`，返回更新后的 `PlanningRecordSummary`
- [x] 2.4 添加后端测试覆盖记录标题创建、列表返回、详情/恢复返回、重命名成功、空标题校验和不存在记录 `404`
- [x] 2.5 添加配置测试覆盖 `.env` 数据库配置加载和未配置 MySQL 时 SQLite fallback

## 3. 前端状态、API 与页面拆分

- [x] 3.1 更新前端 `PlanningRecordSummary` 类型，增加 `title`
- [x] 3.2 新增前端重命名 API 封装，调用 `PATCH /api/planning-records/{record_id}`
- [x] 3.3 拆分首页和历史页组件，首页移除嵌入式历史列表，仅保留进入 `/history` 的入口
- [x] 3.4 使用轻量路径状态渲染 `/` 和 `/history`，并支持浏览器返回/前进
- [x] 3.5 首页识别 `record_id` 查询参数，优先恢复对应历史记录并展示规划结果
- [x] 3.6 新规划成功后刷新当前规划记录标题，使首页规划结果模块能显示当前标题但不能编辑

## 4. 前端历史页与布局

- [x] 4.1 实现 `/history` 历史页卡片列表，展示规划结果名称、场景名称、模拟时间、路线数量、距离、油耗、碳排放和创建时间
- [x] 4.2 实现历史页卡片内联重命名，保存成功后更新当前卡片，编辑控件不触发卡片跳转
- [x] 4.3 实现历史卡片非编辑区域点击跳转到 `/?record_id=<id>` 并触发首页恢复展示
- [x] 4.4 调整首页 CSS 为固定视口布局，按 `1440x900` 优化并在 `1366x768` 下避免主体整体上下滚动
- [x] 4.5 将规划结果路线列表放入模块内部滑动窗口，保持地图和控制模块位置稳定

## 5. 文档、测试与验证

- [x] 5.1 更新 README 或 `docs/demo-workflow.md`，说明 `.env.example`、本地 `.env` 和 MySQL Docker 配置方式
- [x] 5.2 更新前端测试，覆盖历史页展示、内联重命名、点击卡片跳转恢复、直接访问 `record_id` 链接恢复、首页标题展示和规划结果内部滚动样式
- [x] 5.3 运行后端测试：`uv run pytest`
- [x] 5.4 运行前端测试：`cd frontend && npm test`
- [x] 5.5 运行 OpenSpec 校验或状态检查，确认 `improve-planning-history-layout-config` 达到可实施状态
