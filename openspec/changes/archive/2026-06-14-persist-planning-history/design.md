## Context

当前后端通过 `KnowledgePool` 保存活动场景、填充率历史和预测数据，默认使用进程级临时 SQLite 文件。`POST /api/planning/routes` 会基于当前活动场景运行 LangGraph 规划流程并返回 `PlanningResult`，但不会保存本次规划的输入图结构、请求参数或结果。前端只维护最近一次 `scenario` 与 `plan`，地图路线高亮、路线卡片选择和任务点强调都依赖这两个状态。

本次变更需要让每次成功规划都成为可恢复的历史记录。用户选中记录后，不只是只读预览，而是把记录中的 `scenario` 快照恢复为当前活动场景；后续自定义编辑、推进时间和重新规划都从这个场景继续。

## Goals / Non-Goals

**Goals:**

- 保存每次成功规划的完整快照，包括图结构、车辆、处理厂、规划参数、所有车辆路线和指标。
- 支持列出历史记录、读取详情，并将选中记录恢复为当前活动场景。
- 前端选中记录后立即展示该记录的图结构和路线，并继续复用现有单路线选择和地图高亮逻辑。
- 支持通过 Docker 运行 MySQL，并通过环境变量让后端连接该 MySQL 实例。
- 保留测试环境不依赖外部 MySQL 服务的能力。

**Non-Goals:**

- 不修改路线规划算法、目标函数、车辆分配策略或路径搜索逻辑。
- 不提供历史记录删除、重命名、分页搜索或多用户权限控制。
- 不实现路线动画回放时间轴；本次只恢复并展示某次规划的静态图结构和线路。
- 不把历史记录作为审计日志或不可篡改账本处理。

## Decisions

### 规划记录保存完整快照，而不是只保存路线 ID

每条规划记录保存：

- `scenario_snapshot`: 本次规划开始时的完整 `Scenario`
- `planning_result`: 完整 `PlanningResult`
- `seed`、`threshold`、`scenario_id`、`scenario_name`、`simulation_time`
- `route_count`、`total_distance`、`estimated_fuel`、`estimated_carbon`
- `created_at`

这样恢复记录时不依赖当前场景是否仍存在，也不受后续编辑、推进时间或随机生成场景影响。

替代方案是只保存 `routes` 并引用当前 `scenario_id`。这个方案存储更小，但一旦图结构被编辑，历史路线可能指向不存在的节点或边，无法可靠回放。

### 恢复记录时替换 active scenario

`POST /api/planning-records/{id}/restore` 会读取记录中的 `scenario_snapshot`，调用现有活动场景替换逻辑，将其设为当前活动场景，并返回该记录的场景快照和规划结果。前端收到响应后设置 `scenario` 与 `plan`，现有地图渲染和路线卡片逻辑即可展示历史记录。

替代方案是在前端只读预览历史记录，不更新后端 active scenario。用户已确认需要从历史记录继续编辑和规划，因此只读预览不满足需求。

### `POST /api/planning/routes` 成功后创建记录并返回 `record_id`

规划接口在图验证通过且规划流程返回结果后保存记录。API 响应在现有 `PlanningResult` 数据基础上增加 `record_id`，用于前端刷新历史列表和标记当前记录。底层纯规划函数仍可保持算法职责，不需要直接依赖数据库。

替代方案是让前端在拿到规划结果后再调用一个“保存记录”接口。这个方案会让记录创建依赖客户端二次请求，失败时容易出现用户看到规划结果但历史中没有记录的状态。

### 使用可配置关系数据库连接，运行时支持 MySQL，测试保留 SQLite

后端新增数据库 URL 配置，例如：

```bash
GREEN_AGENT_DATABASE_URL='mysql+pymysql://root:135790@127.0.0.1:3306/green_agent?charset=utf8mb4'
```

推荐引入 `SQLAlchemy Core` 管理连接和 SQL 方言差异，引入 `PyMySQL` 连接 MySQL。未设置 `GREEN_AGENT_DATABASE_URL` 时，可以继续使用 SQLite 文件或 SQLite URL 作为本地/测试 fallback。规划记录中的 JSON 快照可先以 UTF-8 JSON 文本保存，避免 MySQL JSON 类型与 SQLite 测试之间产生额外差异。

Docker MySQL 创建命令：

```bash
docker run -d \
  --name green-agent-mysql \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=135790 \
  -e MYSQL_DATABASE=green_agent \
  -v green-agent-mysql-data:/var/lib/mysql \
  mysql:8.4
```

### 前端将历史记录作为可恢复数据源

前端新增历史记录摘要列表。点击记录时调用 restore API，成功后：

- `setScenario(response.scenario)`
- `setPlan(response.plan)`
- 清空待放置节点状态和错误状态
- 由现有 `useEffect` 默认选中第一条路线

当用户随后随机生成场景、推进时间、编辑图或保存当前场景时，前端继续清空 `plan` 和选中路线，避免展示不再匹配当前图结构的历史路线。

## Risks / Trade-offs

- [规划记录快照较大] → 当前演示规模约几十个节点和路线，JSON 文本足够；后续如果场景规模扩大，再增加分页、压缩或归档。
- [MySQL 未启动导致后端无法连接] → README 和演示文档提供 Docker 命令与 `GREEN_AGENT_DATABASE_URL` 示例；测试使用 SQLite fallback。
- [恢复旧记录后继续编辑会产生新的场景状态] → 旧记录保持不可变，新编辑通过现有 `PUT /api/scenarios/current` 保存为当前场景；再次规划会创建新记录。
- [API 响应 schema 变化影响前端测试] → `record_id` 作为新增字段保持向后兼容，现有路线字段不变。
- [JSON 文本字段缺少数据库级结构校验] → 读写时使用 Pydantic/TypeScript 类型校验；数据库只负责持久化快照。

## Migration Plan

1. 新增数据库配置和初始化逻辑，创建 `planning_records` 表。
2. 保留现有 active scenario、history、prediction、event 数据语义，避免影响当前演示流程。
3. 本地运行 MySQL 时，用户先执行 Docker 命令创建容器，再设置 `GREEN_AGENT_DATABASE_URL` 启动后端。
4. 如果需要回退，取消 `GREEN_AGENT_DATABASE_URL` 后可使用 SQLite fallback；已写入 MySQL 的历史记录不会自动迁回 SQLite。

## Open Questions

- 暂不提供删除历史记录能力；如果记录增长影响使用，再单独提出清理或分页能力。
