## MODIFIED Requirements

### Requirement: Planning metrics panel
The frontend SHALL display total route distance, estimated fuel use, estimated carbon emissions, assigned tasks, unassigned tasks, validation warnings, and the current planning record title when available after planning or restoring a record.

#### Scenario: Planning metrics displayed
- **WHEN** a planning result is returned
- **THEN** the metrics panel updates with aggregate metrics, per-vehicle metrics, and any unassigned or unreachable bin reasons

#### Scenario: Planning record title displayed
- **WHEN** the frontend knows the current planning record title after planning or restoring a history record
- **THEN** the planning result panel displays that title without providing an edit control on the home page

### Requirement: 规划历史列表展示
前端 SHALL 在独立历史页面展示可恢复和可重命名的规划历史记录，并让用户能够从列表中选择一条历史规划。

#### Scenario: 显示规划历史摘要
- **WHEN** 用户打开历史页面
- **THEN** 页面展示每条记录的规划结果名称、场景名称、模拟时间、路线数量、总距离、油耗、碳排放和创建时间

#### Scenario: 新规划后刷新历史
- **WHEN** 用户成功执行一次新的路线规划
- **THEN** 前端刷新或重新打开历史页面后，能看到新创建的规划记录

#### Scenario: 内联重命名历史记录
- **WHEN** 用户在历史页面编辑某条历史记录卡片的名称并保存
- **THEN** 前端调用重命名接口，并在成功后更新该卡片展示的规划结果名称

### Requirement: 历史记录地图恢复展示
前端 SHALL 在用户从历史页面选择规划历史记录后跳转到首页恢复该记录，并在地图上展示该记录保存的图结构和车辆线路。

#### Scenario: 选择历史记录
- **WHEN** 用户点击历史页面中的一条规划历史记录卡片
- **THEN** 前端跳转到首页并携带该记录 ID，调用恢复接口，将返回的 `scenario` 设置为当前场景，将返回的 `plan` 设置为当前规划结果，并在地图上渲染该记录的节点、图边和选中路线

#### Scenario: 通过记录链接恢复
- **WHEN** 用户直接访问带有 `record_id` 查询参数的首页链接
- **THEN** 前端恢复该记录并展示对应场景和规划结果，而不是先加载默认当前场景

#### Scenario: 默认高亮恢复记录的第一条路线
- **WHEN** 恢复的规划记录包含至少一条车辆路线
- **THEN** 前端默认选中第一条路线，并只在地图上高亮该路线

#### Scenario: 切换恢复记录中的路线
- **WHEN** 用户在恢复记录的路线卡片中选择另一条车辆路线
- **THEN** 地图移除上一条路线高亮，并只高亮新选中的车辆路线

## ADDED Requirements

### Requirement: 首页单屏布局
前端 SHALL 优化首页布局，使主要模块在桌面演示尺寸下尽量完整展示，并避免通过拖动整个页面查看核心内容。

#### Scenario: 1440x900 首页展示
- **WHEN** 用户在 `1440x900` 视口打开首页
- **THEN** 页面展示顶部状态、控制模块、地图模块和规划结果模块，且核心内容不需要通过浏览器页面整体上下滚动查看

#### Scenario: 1366x768 首页主体不整体滚动
- **WHEN** 用户在 `1366x768` 视口打开首页
- **THEN** 首页主体保持在当前视口内，长内容通过模块内部滚动查看

### Requirement: 规划结果滑动窗口
前端 SHALL 使用规划结果模块内部的滑动窗口展示路线卡片列表，而不是让路线卡片撑高整个页面。

#### Scenario: 路线卡片内部滚动
- **WHEN** 规划结果包含多条车辆路线且路线卡片高度超过规划结果模块可视区域
- **THEN** 用户可以在规划结果模块内部滚动查看路线卡片，地图和控制模块保持在当前页面位置

#### Scenario: 空规划结果不产生页面滚动
- **WHEN** 首页尚未生成规划结果
- **THEN** 规划结果模块显示空状态，并且不会导致浏览器页面整体上下滚动
