# Route Visualization Specification

## Purpose

Define frontend visualization of scenario elements, fill status, planned routes, route order, planning metrics, and simulation controls.

## Requirements

### Requirement: Map element rendering
The frontend SHALL render a React Leaflet tile background, garbage bins, collection vehicles, processing facilities, graph edges, and the selected planned route on the map using visually distinguishable markers and lines.

#### Scenario: Render scenario
- **WHEN** the frontend loads a scenario payload
- **THEN** the map displays the tile background, all nodes at their coordinates, and all graph edges as map polylines with visible weights or selectable edge details

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
The frontend SHALL display total route distance, estimated fuel use, estimated carbon emissions, assigned tasks, unassigned tasks, and validation warnings after planning.

#### Scenario: Planning metrics displayed
- **WHEN** a planning result is returned
- **THEN** the metrics panel updates with aggregate metrics, per-vehicle metrics, and any unassigned or unreachable bin reasons

### Requirement: Time simulation controls
The frontend SHALL provide controls to advance simulation time and refresh visible fill-rate state.

#### Scenario: Advance time from UI
- **WHEN** the user advances simulation time from the frontend
- **THEN** the map updates bin fill-rate styling and the displayed simulation time after the backend returns the new state
