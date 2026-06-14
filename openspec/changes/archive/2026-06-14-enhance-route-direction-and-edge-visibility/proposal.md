## Why

当前地图上的选中路线只通过高亮线条表达路径，无法直接看出车辆行驶方向；同时普通基础图边在 OpenStreetMap 瓦片背景下偏细、偏淡，影响用户理解场景图结构。

这个改动用于提升路线阅读效率：让选中路线通过流动虚线表达方向，并让普通无向图边在地图背景上更清晰。

## What Changes

- 选中车辆路线的高亮路段改为带流动效果的虚线，流动方向遵循 `route.path_node_ids` 从前到后的顺序。
- 普通基础图边保持无向图边语义，不显示方向效果，但增强颜色、线宽或透明度以提升地图背景下的可见性。
- 保持现有路线选择行为：地图只渲染当前选中路线的高亮覆盖层，未选中路线不作为路线覆盖层展示。
- 保持现有路段弹窗能力：选中路线段仍可查看路段长度、车辆燃油率、预计燃油和预计碳排放。
- 不修改后端规划算法、API schema 或数据模型。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `route-visualization`: 增加选中路线方向可视化要求，并强化普通基础图边在地图背景下的可见性要求。

## Impact

- 前端地图渲染：`frontend/src/App.tsx`
- 前端地图样式：`frontend/src/styles.css`
- 前端测试：`frontend/src/App.test.tsx`
- 规格：`openspec/specs/route-visualization/spec.md`
- API、后端模型、规划算法和依赖：无影响
