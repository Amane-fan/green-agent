## Why

当前系统已经能够生成、恢复并展示完整路线规划结果，但用户只能通过地图和右侧结果面板逐项查看指标，难以用自然语言快速理解“为什么这样规划”“哪辆车负载更重”“未分配任务原因是什么”等问题。

引入 AI 助手可以让用户围绕当前首页正在展示的完整规划结果进行多轮询问，提升演示和分析效率，同时保持关键规划计算仍由现有确定性后端流程完成。

## What Changes

- 新增首页右下角 AI 助手悬浮球，点击后展开对话框。
- AI 助手只围绕当前首页正在展示的完整规划结果回答问题，覆盖该结果中的所有车辆路线、未分配任务、聚合指标、场景快照和规划 trace，不受当前地图高亮车辆限制。
- 支持当前页面内多轮对话上下文，刷新页面后丢失，不在后端持久化聊天记录。
- 用户重新规划、恢复另一条历史记录、推进时间或编辑图结构后，前端清空 AI 对话上下文。
- 新增后端流式聊天接口，前端通过流式响应逐段展示 AI 回复。
- 后端通过 OpenAI-compatible Chat Completions streaming API 调用模型，并从 `.env` 读取 `AI_ASSISTANT_BASE_URL`、`AI_ASSISTANT_API_KEY` 和 `AI_ASSISTANT_MODEL`。
- 当没有当前规划结果、规划记录不存在或 AI 配置缺失时，系统返回明确错误并在前端展示可理解提示。

## Capabilities

### New Capabilities

- `ai-planning-assistant`: 定义基于当前规划记录快照的 AI 助手能力，包括前端悬浮对话、多轮上下文、后端流式代理、OpenAI-compatible 配置和错误处理。

### Modified Capabilities

- 无。

## Impact

- 后端：新增 AI 助手请求/响应模型、规划记录上下文摘要构建逻辑、OpenAI-compatible 流式调用封装和 `POST /api/ai-assistant/chat/stream` 接口。
- 前端：新增 AI 助手悬浮球、对话框、页面内消息状态、流式读取逻辑和对规划结果变化的对话清空逻辑。
- 配置：`.env.example` 和 README 增加 `AI_ASSISTANT_BASE_URL`、`AI_ASSISTANT_API_KEY`、`AI_ASSISTANT_MODEL` 示例说明。
- 依赖：后端可能需要新增 HTTP 客户端依赖用于安全地代理流式模型响应。
- 测试：补充后端接口配置错误、记录读取、上下文构建和流式响应测试；补充前端悬浮球、多轮消息、流式展示和上下文清空测试。
