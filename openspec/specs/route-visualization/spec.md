# Route Visualization Specification

## Purpose

Define frontend visualization of scenario elements, fill status, planned routes, route order, planning metrics, and simulation controls.

## Requirements

### Requirement: Map element rendering
The frontend SHALL render a React Leaflet tile background, garbage bins, collection vehicles, processing facilities, graph edges, and the selected planned route on the map using visually distinguishable markers and lines. 普通基础图边 SHALL 在瓦片背景下保持清晰可辨，同时不表达方向语义。

#### Scenario: Render scenario
- **WHEN** the frontend loads a scenario payload
- **THEN** the map displays the tile background, all nodes at their coordinates, and all graph edges as map polylines with sufficient visual contrast against the tile background and visible weights or selectable edge details

#### Scenario: Inspect base graph edge
- **WHEN** the user clicks a normal graph edge that is not a highlighted selected route segment
- **THEN** the map popup displays the edge route length and does not display vehicle fuel metrics

### Requirement: Fill-rate visual encoding
The frontend SHALL visually encode garbage bin fill rates and garbage categories.

#### Scenario: Render bin status
- **WHEN** a bin has a category and current fill rate
- **THEN** the map marker conveys the category and the marker styling conveys the fill-rate severity

### Requirement: Route color assignment
The frontend SHALL render route cards for all planned vehicle routes and use the corresponding route color on the map only for the currently selected vehicle route.

#### Scenario: Display multiple vehicle routes
- **WHEN** the planning result contains routes for multiple vehicles
- **THEN** the side panel displays each route in a different color and associates that color with the corresponding vehicle

#### Scenario: Select first route by default
- **WHEN** a planning result contains at least one route
- **THEN** the frontend selects the first route by default and only highlights that route on the map

#### Scenario: Select another route
- **WHEN** the user selects another route card in the side panel
- **THEN** the selected card receives a visual marker and the map only highlights that vehicle route

#### Scenario: Hide unselected route overlays
- **WHEN** a planning result contains a route that is not currently selected
- **THEN** the map does not render that route as a highlighted route overlay

### Requirement: Selected route direction visibility
前端 SHALL 在当前选中的车辆路线高亮层上使用流动虚线展示车辆行驶方向。

#### Scenario: Display selected route direction
- **WHEN** 规划结果包含当前选中的车辆路线
- **THEN** 地图将该路线的高亮路段显示为流动虚线，并且流动方向遵循 `route.path_node_ids` 中相邻节点从前到后的顺序

#### Scenario: Keep base graph edges directionless
- **WHEN** 地图显示普通基础图边
- **THEN** 普通基础图边不显示流动虚线、箭头或其他方向效果

#### Scenario: Do not show direction for unselected routes
- **WHEN** 规划结果包含当前未选中的车辆路线
- **THEN** 地图不为该未选中路线渲染流动虚线方向覆盖层

### Requirement: Route order visibility
前端 SHALL 显示每条车辆路线的有序任务序列，包括车辆起点、按顺序排列的回收垃圾桶和目标处理设施，并允许通过路线卡片选择地图上高亮的路线。

#### Scenario: Inspect route order
- **WHEN** 用户选择一条已规划路线或一辆车
- **THEN** 前端显示该路线的车辆起点、按顺序排列的回收垃圾桶和目标处理设施，并排除仅出现在 `path_node_ids` 但不在 `route.stops` 中的垃圾桶

#### Scenario: Select route from order panel
- **WHEN** 用户点击路线顺序面板中的路线卡片
- **THEN** 该路线成为地图高亮、车辆起点强调、回收点强调和路段查看所使用的选中路线

### Requirement: Selected route task point emphasis
前端 SHALL 在当前选中车辆路线中突出展示车辆起点和实际需要回收的垃圾桶，并将仅作为行驶路径途经的垃圾桶保持为普通节点展示。

#### Scenario: Emphasize selected route start and collection bins
- **WHEN** 规划结果包含当前选中的车辆路线，且该路线的 `path_node_ids` 经过了不在 `route.stops` 中的垃圾桶
- **THEN** 地图突出显示该车辆的起点节点和 `route.stops` 中 `node_type` 为 `bin` 的垃圾桶，并且不将仅途经的垃圾桶显示为回收任务点

#### Scenario: Clear emphasis when route selection changes
- **WHEN** 用户从右侧面板选择另一条车辆路线
- **THEN** 地图移除上一条路线的起点和回收点强调，并只强调新选中路线的车辆起点和回收垃圾桶

### Requirement: Selected route segment metrics
The frontend SHALL expose vehicle-related segment metrics only on highlighted segments of the currently selected vehicle route.

#### Scenario: Inspect highlighted route segment
- **WHEN** the user clicks a highlighted segment of the currently selected route
- **THEN** the map popup displays segment length, selected vehicle fuel rate, estimated segment fuel, and estimated segment carbon emissions

#### Scenario: Unselected route segments are not interactive
- **WHEN** a planned route is not currently selected
- **THEN** that route's segments are not rendered as highlighted clickable route segments and do not expose vehicle fuel metrics

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

### Requirement: 恢复场景后的继续操作
前端 SHALL 将恢复的规划记录视为当前活动场景的来源，并在后续场景变化时清空不再匹配的规划展示。

#### Scenario: 恢复后继续编辑图结构
- **WHEN** 用户恢复历史记录后添加节点、添加边或保存当前场景
- **THEN** 前端清空当前规划结果和选中路线，直到用户重新执行路线规划

#### Scenario: 恢复后推进时间
- **WHEN** 用户恢复历史记录后推进模拟时间
- **THEN** 前端显示后端返回的新场景状态，并清空恢复记录中的旧规划结果

### Requirement: Time simulation controls
The frontend SHALL provide controls to advance simulation time and refresh visible fill-rate state.

#### Scenario: Advance time from UI
- **WHEN** the user advances simulation time from the frontend
- **THEN** the map updates bin fill-rate styling and the displayed simulation time after the backend returns the new state
