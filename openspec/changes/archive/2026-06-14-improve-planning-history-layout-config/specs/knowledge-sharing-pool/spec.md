## MODIFIED Requirements

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
