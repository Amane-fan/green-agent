## MODIFIED Requirements

### Requirement: Planning result schema
The system SHALL return structured planning results containing per-vehicle routes, ordered stops, expanded graph paths, total distance, estimated fuel use, estimated carbon emissions, unassigned tasks, and an API-created planning record identifier when the result is persisted.

#### Scenario: Successful planning result
- **WHEN** at least one feasible route is produced
- **THEN** the response includes one route record per used vehicle and aggregate metrics for the full plan

#### Scenario: Successful API planning result creates record id
- **WHEN** 用户通过 `POST /api/planning/routes` 成功执行路线规划
- **THEN** 响应包含本次持久化规划记录的 `record_id`

#### Scenario: Algorithm result can remain storage-independent
- **WHEN** 后端在不经过 API 持久化流程的测试或内部逻辑中直接运行规划算法
- **THEN** 规划结果仍包含路线、路径和指标，且不要求必须存在 `record_id`
