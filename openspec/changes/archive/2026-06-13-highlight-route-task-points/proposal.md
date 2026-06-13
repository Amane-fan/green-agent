## Why

当前选中路线会按最短路径经过一些不需要回收的垃圾桶，地图上所有垃圾桶又使用同一层级展示，导致用户难以区分“只是路过”和“本次需要收运”的点。路线展示还缺少车辆当前位置作为起点，用户无法从右侧面板和地图上快速理解车辆从哪里出发。

## What Changes

- 在选中路线展示中，将“行驶几何路径”和“任务点序列”明确区分：`route.path_node_ids` 用于绘制路线，`route.stops` 用于强调需要回收的垃圾桶和目标处理厂。
- 右侧路线卡片展示车辆起点、按顺序回收的垃圾桶、目标处理厂，并对回收点使用比途经点更突出的视觉层级。
- 地图在当前选中路线中突出展示车辆起点和需要回收的垃圾桶；仅途经但不回收的垃圾桶保持普通节点样式。
- 继续只高亮当前选中路线，不展示未选中路线的高亮覆盖层。
- 不修改后端 API schema，不改变路线规划算法。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `route-visualization`: 调整选中路线的任务点、车辆起点和途经点展示规则。

## Impact

- 影响前端 `frontend/src/App.tsx` 中路线卡片、地图 marker 和选中路线派生数据。
- 影响前端样式 `frontend/src/styles.css` 中路线任务序列和高亮 marker 的视觉层级。
- 影响前端测试 `frontend/src/App.test.tsx`，需要覆盖车辆起点、回收点和途经点的展示区别。
- 不影响后端 models、planning、API payload 或数据库。
