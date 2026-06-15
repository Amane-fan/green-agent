## Context

当前后端已经在 `app.main` 启动时加载项目根目录 `.env`，并通过 `KnowledgePool` 持久化规划记录快照。每次成功规划或恢复历史记录后，前端首页会持有当前展示的 `scenario` 和 `plan`，其中 `plan.record_id` 可回到后端读取完整规划快照。

AI 助手会同时触及前端交互、后端 API、外部模型服务和配置安全。关键约束是：AI 只能解释当前首页正在展示的完整规划结果，不能替代现有确定性规划流程，也不能把 `AI_ASSISTANT_API_KEY` 暴露给浏览器。

## Goals / Non-Goals

**Goals:**

- 在首页提供右下角悬浮球和展开式 AI 对话框。
- 支持围绕当前展示的完整规划结果进行流式、多轮问答。
- 后端使用 `record_id` 读取规划快照，并把所有车辆路线、未分配任务、聚合指标、场景快照和 trace 作为模型事实上下文。
- 通过 OpenAI-compatible Chat Completions streaming API 调用模型，配置来自 `.env` 或进程环境变量。
- 多轮聊天历史只保存在当前前端页面内，不写入数据库。
- 在没有规划结果、规划记录不存在、AI 配置缺失或模型调用失败时提供明确错误反馈。

**Non-Goals:**

- 不让 LLM 修改、重新优化或持久化路线规划结果。
- 不持久化用户和 AI 的聊天记录。
- 不做跨规划记录对比分析。
- 不引入用户认证、配额、审计日志或后台会话管理。
- 不在本次变更中实现语音输入、文件上传或工具调用。

## Decisions

### 1. 后端代理模型调用，前端只传 `record_id` 和页面内消息

前端每次请求 `POST /api/ai-assistant/chat/stream` 时发送当前 `plan.record_id` 和最近若干条对话消息。后端重新读取该记录的 `scenario + plan` 快照，并将其构造成模型上下文。

采用该方案的原因：

- API key 只存在后端环境变量中，避免泄露给浏览器。
- 事实来源固定为后端持久化规划快照，用户消息不能篡改规划数据。
- 请求体较小，前端不需要每轮重复提交完整 `scenario + plan`。

备选方案是前端每次发送完整 `scenario + plan`。该方案能完全贴合页面状态，但请求体更大、上下文可被浏览器篡改，并且会重复暴露大量内部数据，因此不采用。

### 2. 使用 `text/event-stream` 承载 POST 流式响应

接口使用 `fetch` 发起 POST 请求，并读取 `ReadableStream`。后端返回 `text/event-stream`，逐段发送模型增量内容，最后发送完成事件。选择 POST 是因为请求需要携带 `record_id` 和多轮 `messages`，而浏览器原生 `EventSource` 不适合带 JSON 请求体。

流事件建议使用 JSON payload，例如：

```text
data: {"delta":"..."}

data: {"done":true}
```

如果模型流中途失败，后端发送错误事件后关闭连接；前端将当前 AI 消息标记为失败并允许用户重试。

### 3. 直接调用 OpenAI-compatible Chat Completions API

后端新增独立模块封装模型调用，使用直接 HTTP 客户端请求：

- `AI_ASSISTANT_BASE_URL`: 兼容 API 根地址，例如 `https://api.example.com/v1`
- `AI_ASSISTANT_API_KEY`: 服务端密钥
- `AI_ASSISTANT_MODEL`: 模型名称

请求发送到 `{AI_ASSISTANT_BASE_URL}/chat/completions`，body 包含 `model`、`messages`、`stream: true` 和适合解释型问答的低温度配置。实现时可将 `httpx` 显式加入后端依赖，避免依赖传递依赖的可用性。

不使用官方 OpenAI SDK 的原因是当前需求只依赖通用 Chat Completions streaming 协议，直接 HTTP 调用更容易兼容不同供应商，也更容易在测试中模拟流式响应。

### 4. 上下文构建使用紧凑、确定性的规划摘要

后端从规划记录中构建一个模型不可更改的事实上下文，包含：

- 规划记录名称、场景名称、模拟时间和请求参数。
- 所有车辆路线的车辆 ID、起点、回收点顺序、终点、距离、油耗、碳排放和车辆能力。
- 未分配任务及原因。
- 总距离、总油耗、总碳排放、warnings 和 trace。
- 必要的节点、车辆、处理厂和图边信息。

系统提示要求模型只基于提供的规划上下文回答；当问题超出上下文时说明无法从当前规划结果判断。对话历史只用于理解指代关系，例如“它为什么最长”，不能覆盖事实上下文。

### 5. 前端组件隔离在独立 AI 助手组件中

当前 `frontend/src/App.tsx` 已经承担地图、控制面板、历史跳转和路线结果展示。为避免继续膨胀，AI 助手应抽成独立组件，例如 `PlanningAssistant`，由 `App` 传入当前 `plan?.record_id` 和用于清空对话的上下文 key。

前端维护：

- 悬浮球展开状态。
- 页面内 `messages`。
- 当前流式输出状态。
- 错误状态。

当 `plan.record_id` 变化、`plan` 被清空或当前场景被修改时，组件清空消息。没有可用 `record_id` 时，悬浮窗显示“请先规划路线”提示，不发起聊天请求。

## Risks / Trade-offs

- [Risk] 规划快照过大导致模型上下文超限 → 使用紧凑摘要并限制发送最近对话消息数量，必要时截断 trace 或图边细节。
- [Risk] 不同 OpenAI-compatible 供应商的流式事件格式略有差异 → 优先支持 Chat Completions 常见 SSE 格式，并在错误提示中暴露供应商返回的简要错误。
- [Risk] 模型可能受用户提示影响偏离规划事实 → 系统提示明确事实来源，后端始终把规划摘要放在用户消息之前。
- [Risk] 流式响应中途断开造成半条回复 → 前端保留已接收文本并展示失败状态，允许重新发送。
- [Risk] 当前页面展示的规划结果没有 `record_id` → 现有 API 持久化规划和恢复历史记录都会提供 `record_id`；无 `record_id` 时前端禁止提问并提示先规划。

## Migration Plan

1. 新增后端 AI 助手模型、上下文构建模块和流式接口。
2. 新增前端 AI 助手组件和 `api.ts` 流式请求封装。
3. 更新 `.env.example`、README 或演示文档，说明 AI 助手配置。
4. 补充后端和前端测试。

无需数据库迁移。回滚时移除新增接口、前端组件和配置说明即可，不影响已有规划记录和路线规划功能。

## Open Questions

无。已确认 AI 助手只针对当前首页正在展示的完整规划结果，多轮上下文仅保留在当前页面内，响应需要流式输出，模型名通过 `AI_ASSISTANT_MODEL` 配置。
