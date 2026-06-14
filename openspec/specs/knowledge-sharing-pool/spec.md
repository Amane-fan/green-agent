# Knowledge Sharing Pool Specification

## Purpose

Define shared scenario, historical fill, and prediction data storage used by planning and orchestration modules.

## Requirements

### Requirement: 可配置关系数据库存储
系统 SHALL 支持通过配置选择共享数据池使用的关系数据库连接，并 SHALL 在后端启动读取数据库配置前加载项目根目录 `.env`，同时支持连接 Docker 中运行的 MySQL 实例。

#### Scenario: 使用 `.env` 中的 MySQL 数据库连接
- **WHEN** `.env` 设置 `GREEN_AGENT_DATABASE_URL` 为 `mysql+pymysql://root:135790@127.0.0.1:3306/green_agent?charset=utf8mb4` 且进程环境未覆盖该配置
- **THEN** 共享数据池使用该 MySQL 数据库保存活动场景、历史数据、预测数据和规划记录

#### Scenario: 进程环境变量优先
- **WHEN** 进程环境变量已经设置 `GREEN_AGENT_DATABASE_URL`
- **THEN** 系统使用进程环境变量中的数据库连接配置，而不是覆盖为 `.env` 中的同名配置

#### Scenario: 使用测试数据库连接
- **WHEN** 测试环境未启动 MySQL且未配置 `GREEN_AGENT_DATABASE_URL`
- **THEN** 系统仍可使用 SQLite 或等效轻量数据库连接运行后端测试

### Requirement: Historical fill data storage
The system SHALL store historical fill-rate records for garbage bins, including bin id, simulation time, fill rate, and optional collection event metadata.

#### Scenario: Store fill history after time advance
- **WHEN** simulation time advances and bin fill rates change
- **THEN** the system records the updated fill rate for each bin in the knowledge sharing pool

### Requirement: Prediction data storage
The system SHALL store predicted fill-rate records for garbage bins so planning agents can use near-term urgency information.

#### Scenario: Store prediction horizon
- **WHEN** the system computes fill predictions for a scenario
- **THEN** the knowledge sharing pool stores predicted fill rates keyed by bin id and future simulation time

### Requirement: Planning state retrieval
The system SHALL provide the latest scenario state, historical fill data, and prediction data to route planning and orchestration modules.

#### Scenario: Planner requests shared state
- **WHEN** the route planning workflow starts
- **THEN** the knowledge sharing pool returns current bin states, relevant history, predictions, vehicles, facilities, and graph data

### Requirement: 规划记录快照存储
系统 SHALL 在共享数据池中持久化规划记录快照，使记录可跨页面刷新和后端重启后继续查询、重命名与恢复。

#### Scenario: 持久化规划快照
- **WHEN** 系统保存规划记录
- **THEN** 共享数据池保存记录 ID、规划结果名称、场景元数据、请求参数、聚合指标、场景快照、规划结果和创建时间

#### Scenario: 重启后读取规划记录
- **WHEN** 后端使用同一个持久化数据库重启
- **THEN** 系统仍可列出并读取之前保存的规划记录，包括规划结果名称

#### Scenario: 兼容旧规划记录
- **WHEN** 共享数据池中存在未包含规划结果名称的旧规划记录
- **THEN** 系统为旧记录提供可展示的默认规划结果名称，并允许后续重命名

### Requirement: Scenario reset isolation
The system MUST isolate records between different generated or custom scenarios. 系统 SHALL 保持规划记录可查询和可恢复，除非用户使用明确的规划记录删除能力。

#### Scenario: Replace active scenario
- **WHEN** the user creates a new random scenario or clears the custom scenario
- **THEN** the system starts a new scenario context and does not mix previous scenario history into the new planning workflow

#### Scenario: Preserve planning records across reset
- **WHEN** 用户重置或生成新的活动场景
- **THEN** 之前保存的规划记录仍保留在规划历史中，并可被用户选择恢复
