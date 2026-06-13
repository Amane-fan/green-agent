## ADDED Requirements

### Requirement: Selected route task point emphasis
前端 SHALL 在当前选中车辆路线中突出展示车辆起点和实际需要回收的垃圾桶，并将仅作为行驶路径途经的垃圾桶保持为普通节点展示。

#### Scenario: Emphasize selected route start and collection bins
- **WHEN** 规划结果包含当前选中的车辆路线，且该路线的 `path_node_ids` 经过了不在 `route.stops` 中的垃圾桶
- **THEN** 地图突出显示该车辆的起点节点和 `route.stops` 中 `node_type` 为 `bin` 的垃圾桶，并且不将仅途经的垃圾桶显示为回收任务点

#### Scenario: Clear emphasis when route selection changes
- **WHEN** 用户从右侧面板选择另一条车辆路线
- **THEN** 地图移除上一条路线的起点和回收点强调，并只强调新选中路线的车辆起点和回收垃圾桶

## MODIFIED Requirements

### Requirement: Route order visibility
前端 SHALL 显示每条车辆路线的有序任务序列，包括车辆起点、按顺序排列的回收垃圾桶和目标处理设施，并允许通过路线卡片选择地图上高亮的路线。

#### Scenario: Inspect route order
- **WHEN** 用户选择一条已规划路线或一辆车
- **THEN** 前端显示该路线的车辆起点、按顺序排列的回收垃圾桶和目标处理设施，并将仅作为 `path_node_ids` 途经但不在 `route.stops` 中的垃圾桶排除在任务序列之外

#### Scenario: Select route from order panel
- **WHEN** 用户点击路线顺序面板中的路线卡片
- **THEN** 该路线成为地图高亮、车辆起点强调、回收点强调和路段查看所使用的选中路线
