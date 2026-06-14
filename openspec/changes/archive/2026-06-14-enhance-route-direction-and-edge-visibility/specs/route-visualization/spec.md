## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Map element rendering
The frontend SHALL render a React Leaflet tile background, garbage bins, collection vehicles, processing facilities, graph edges, and the selected planned route on the map using visually distinguishable markers and lines. 普通基础图边 SHALL 在瓦片背景下保持清晰可辨，同时不表达方向语义。

#### Scenario: Render scenario
- **WHEN** the frontend loads a scenario payload
- **THEN** the map displays the tile background, all nodes at their coordinates, and all graph edges as map polylines with sufficient visual contrast against the tile background and visible weights or selectable edge details

#### Scenario: Inspect base graph edge
- **WHEN** the user clicks a normal graph edge that is not a highlighted selected route segment
- **THEN** the map popup displays the edge route length and does not display vehicle fuel metrics
