## Why

“绿运先锋——垃圾分类收运多智能体路径优化系统”需要把垃圾桶满溢监测、分类收运车辆、处理厂和路径优化统一到一个可交互演示系统中。当前仓库还没有应用骨架，本变更将建立从地图建模、时间模拟、任务编排到路线可视化的完整 MVP，支撑 SE2026-12 课题展示。

## What Changes

- 新增 Python + uv 后端服务，提供场景建模、模拟、可达性分析、路径优化和 LangGraph 多智能体编排能力。
- 新增 React + React Leaflet 前端，支持在地图上创建垃圾桶、收运车辆、处理厂和无向加权边。
- 支持一键随机生成演示场景，默认包含 30 个垃圾桶、5 辆收运车辆、3 个处理厂，并保证图无向、连通、有边权。
- 支持按垃圾类别分车收运，车辆和处理厂对垃圾类别形成硬约束。
- 支持模拟时间变化导致不同垃圾桶满溢率按不同趋势增长，并记录历史数据和预测数据。
- 支持点击“规划路线”后，根据当前满溢状态、类别约束、可达性和路线成本，为多辆车规划路线。
- 路线规划目标优先考虑最短距离和尽快清空高满溢垃圾桶。
- 前端在地图上以不同颜色展示不同收运车辆的路径，并展示总距离、任务分配、油耗和碳排放估算。

## Capabilities

### New Capabilities

- `map-scenario-management`: 管理 React Leaflet 地图场景，支持自定义创建节点、边和随机生成连通无向加权图。
- `fill-level-simulation`: 模拟垃圾桶满溢率随时间变化，支持不同垃圾桶具有不同增长趋势。
- `knowledge-sharing-pool`: 存储垃圾桶满溢历史数据、预测数据和规划所需共享状态。
- `multi-agent-orchestration`: 使用 LangGraph 编排垃圾桶监测 Agent、任务编排器 Agent、车辆 Agent、处理厂 Agent 和可达性分析 Agent。
- `collection-route-planning`: 在类别约束、可达性约束和优先级目标下，为多辆收运车规划收运顺序和处理厂终点。
- `route-visualization`: 在前端地图上展示规划结果、车辆路径颜色、任务顺序和关键指标。

### Modified Capabilities

- 无。当前仓库没有已有 specs。

## Impact

- 后端：新增 uv 项目配置、FastAPI 服务、LangGraph 编排模块、图分析模块、满溢模拟模块、路径优化模块、知识共享池存储模块。
- 前端：新增 React 应用、React Leaflet 地图编辑器、随机场景生成入口、时间模拟控件、路线展示层和指标面板。
- 数据：新增模拟场景数据结构、垃圾类别约束、车辆能力、处理厂接收能力、边权、满溢历史和预测记录。
- 算法：新增连通性校验、最短路计算、可达性分析和遗传算法路线优化。
- 依赖：Python 侧预计使用 `fastapi`、`uvicorn`、`langgraph`、`pydantic`、`networkx`、`numpy`；前端侧预计使用 `react`、`vite`、`react-leaflet`、`leaflet`。
