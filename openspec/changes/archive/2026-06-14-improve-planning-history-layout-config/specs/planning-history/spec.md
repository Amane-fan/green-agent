## MODIFIED Requirements

### Requirement: 规划记录创建
系统 SHALL 在每次成功执行路线规划后创建一条规划记录，记录 SHALL 包含用户可编辑的规划结果名称、规划时的完整场景快照、规划请求参数、完整规划结果、聚合指标和创建时间。

#### Scenario: 保存成功规划记录
- **WHEN** 用户对有效图结构发起路线规划且后端成功返回规划结果
- **THEN** 系统保存一条规划记录，记录中的 `title` 为后端生成的默认规划结果名称，`scenario_snapshot` 与规划时的活动场景一致，`planning_result` 与返回给用户的规划结果一致

#### Scenario: 不保存失败规划记录
- **WHEN** 用户发起路线规划但图验证失败或后端返回错误
- **THEN** 系统 MUST NOT 创建规划记录

### Requirement: 规划记录列表
系统 SHALL 提供规划记录摘要列表，供前端展示可恢复和可重命名的历史规划。

#### Scenario: 按时间查看历史记录
- **WHEN** 前端请求规划记录列表
- **THEN** 系统返回按创建时间倒序排列的记录摘要，每条摘要包含记录 ID、规划结果名称、场景名称、模拟时间、路线数量、总距离、油耗、碳排放和创建时间

### Requirement: 规划记录详情
系统 SHALL 提供单条规划记录详情，详情 SHALL 包含该记录的摘要信息、场景快照和完整规划结果。

#### Scenario: 读取记录详情
- **WHEN** 前端请求某条存在的规划记录详情
- **THEN** 系统返回该记录的摘要信息、`scenario` 快照和 `plan` 规划结果，摘要信息包含规划结果名称

#### Scenario: 读取不存在记录
- **WHEN** 前端请求不存在的规划记录
- **THEN** 系统返回 `404` 错误

### Requirement: 恢复规划记录为当前场景
系统 SHALL 允许用户将一条规划记录恢复为当前活动场景，并返回该记录保存的规划结果用于地图展示。

#### Scenario: 恢复历史记录
- **WHEN** 用户选择恢复一条存在的规划记录
- **THEN** 系统将该记录的 `scenario_snapshot` 设置为当前活动场景，并返回恢复后的 `scenario`、该记录的 `plan` 和包含规划结果名称的记录摘要

#### Scenario: 基于恢复场景继续规划
- **WHEN** 用户恢复历史记录后再次发起路线规划
- **THEN** 新规划 SHALL 使用恢复后的当前活动场景，并在成功后创建新的规划记录

## ADDED Requirements

### Requirement: 规划记录重命名
系统 SHALL 允许用户更新已有规划记录的规划结果名称，并 SHALL 保留该记录的场景快照、规划结果和聚合指标不变。

#### Scenario: 成功重命名规划记录
- **WHEN** 前端向 `PATCH /api/planning-records/{record_id}` 提交非空 `title`
- **THEN** 系统更新该规划记录的名称并返回更新后的记录摘要

#### Scenario: 拒绝空名称
- **WHEN** 前端提交空白 `title` 或只包含空白字符的 `title`
- **THEN** 系统返回校验错误并 MUST NOT 更新规划记录

#### Scenario: 重命名不存在记录
- **WHEN** 前端请求重命名不存在的规划记录
- **THEN** 系统返回 `404` 错误
