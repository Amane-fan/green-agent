## Why

当前系统只能展示最近一次规划结果，用户无法回看过往规划时的图结构、车辆线路和指标，也无法从某条历史规划继续编辑、推进时间或重新规划。演示和实验需要保留每次成功规划的完整上下文，并让历史记录可以恢复为当前活动场景。

## What Changes

- 新增规划历史记录能力：每次成功路线规划后保存一条记录，包含场景图结构快照、规划请求参数、完整规划结果和创建时间。
- 新增历史记录查询和恢复 API：前端可列出历史记录、读取详情，并将选中记录恢复为当前活动场景。
- 选中历史记录后，地图展示该记录保存的图结构和不同车辆线路，右侧路线卡片继续支持选择单条路线并高亮展示。
- 恢复历史记录后，后续自定义编辑、推进时间和重新规划都基于恢复后的场景继续；当场景被修改或推进时间后，历史规划结果展示应清空，避免路线与当前图结构不一致。
- 后端持久化从仅支持本地临时 SQLite 的实现扩展为可配置数据库连接，支持使用 Docker 运行的 MySQL；测试环境仍可使用 SQLite 或等效轻量配置。
- 提供 MySQL Docker 容器创建命令和后端数据库连接环境变量说明。

## Capabilities

### New Capabilities

- `planning-history`: 定义规划记录的保存、查询、详情读取和恢复为当前活动场景的行为。

### Modified Capabilities

- `knowledge-sharing-pool`: 扩展共享数据池，使其支持持久化规划记录快照，并支持通过可配置数据库连接使用 MySQL。
- `collection-route-planning`: 扩展规划接口行为，使成功规划会创建历史记录，且响应或相关 API 能让前端识别新记录。
- `route-visualization`: 扩展前端展示行为，使用户可选择历史规划记录并在地图上展示该记录的图结构和车辆线路。

## Impact

- 后端模型：新增规划记录摘要、详情和恢复响应模型。
- 后端存储：扩展 `app/knowledge.py` 或拆分存储层，新增 `planning_records` 表及 JSON 快照字段。
- 后端 API：新增 `GET /api/planning-records`、`GET /api/planning-records/{id}`、`POST /api/planning-records/{id}/restore`，并调整 `POST /api/planning/routes` 的记录保存行为。
- 数据库依赖：新增 MySQL 驱动和可配置数据库 URL；保留测试可运行的轻量数据库路径。
- 前端 API/types：新增历史记录类型和接口调用。
- 前端 UI：在现有控制面板或规划结果面板增加历史记录列表和恢复交互。
- 测试：增加后端记录保存/恢复测试、前端历史记录选择后地图和路线展示测试。
- 文档：更新 README 或演示文档，给出 Docker MySQL 创建命令和 `GREEN_AGENT_DATABASE_URL` 示例。
