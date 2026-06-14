## 1. 后端接口与模型调用

- [x] 1.1 在 `app.models` 中新增 AI 助手请求消息、流式聊天请求等 Pydantic 模型，并校验消息列表和最后一条用户消息
- [x] 1.2 新增 AI 助手配置读取逻辑，读取 `AI_ASSISTANT_BASE_URL`、`AI_ASSISTANT_API_KEY`、`AI_ASSISTANT_MODEL` 并在缺失时返回明确错误
- [x] 1.3 新增规划记录上下文构建函数，从 `record_id` 对应的规划快照生成包含所有车辆路线、未分配任务、聚合指标、场景快照和 trace 的紧凑摘要
- [x] 1.4 新增 OpenAI-compatible Chat Completions streaming 调用封装，解析上游 SSE 增量内容并转换为后端统一流事件
- [x] 1.5 在 `app.main` 中新增 `POST /api/ai-assistant/chat/stream`，按 `record_id` 读取规划记录、校验配置、返回 `text/event-stream`
- [x] 1.6 显式声明后端 HTTP 客户端依赖并更新锁文件，避免依赖传递依赖

## 2. 后端测试

- [x] 2.1 添加配置测试，覆盖 AI 助手环境变量读取完整和缺失两类情况
- [x] 2.2 添加上下文构建测试，验证多车辆路线、未分配任务、聚合指标和 trace 都进入上下文，且不只包含当前高亮车辆
- [x] 2.3 添加接口测试，验证存在 `record_id` 时返回 `text/event-stream` 并流式输出模型片段
- [x] 2.4 添加错误测试，覆盖未知 `record_id`、空消息、配置缺失和上游模型错误不调用或正确传播

## 3. 前端 API 与组件

- [x] 3.1 在 `frontend/src/types.ts` 中新增 AI 助手消息和流式事件类型
- [x] 3.2 在 `frontend/src/api.ts` 中新增 `streamPlanningAssistantChat`，使用 `fetch` POST 请求并解析 `text/event-stream` 增量事件
- [x] 3.3 新增独立 `PlanningAssistant` 组件，包含右下角悬浮球、可关闭对话框、消息列表、输入框、发送按钮和错误展示
- [x] 3.4 在 `App` 首页接入 `PlanningAssistant`，传入当前 `plan?.record_id` 和随规划上下文变化而变化的清空 key
- [x] 3.5 实现页面内多轮消息状态，发送时携带最近对话历史，刷新页面不恢复聊天记录
- [x] 3.6 实现流式输出追加、发送期间禁用重复提交、失败状态展示和重试后的消息追加行为
- [x] 3.7 在没有当前 `record_id` 的规划结果时展示先规划提示，并阻止向后端发送问题

## 4. 前端样式与可用性

- [x] 4.1 为悬浮球和对话框补充 CSS，确保其固定在首页右下角且不破坏现有三栏单屏布局
- [x] 4.2 确保对话框消息区域内部滚动，避免撑高页面或遮挡主要控制按钮
- [x] 4.3 补充基础键盘和无障碍属性，包括按钮 `aria-label`、输入框标签和发送状态提示

## 5. 前端测试

- [x] 5.1 添加悬浮球打开和关闭测试，验证对话框入口存在且关闭后页面内消息保留
- [x] 5.2 添加无规划结果测试，验证提示用户先规划且不发起聊天请求
- [x] 5.3 添加流式输出测试，mock `ReadableStream` 并验证多个片段追加到同一条 AI 消息
- [x] 5.4 添加多轮上下文测试，验证第二次提问会携带页面内最近消息
- [x] 5.5 添加规划结果变化测试，验证重新规划、恢复记录或推进时间后清空 AI 消息
- [x] 5.6 添加样式约束测试，验证悬浮层固定定位、消息区域内部滚动且不会引入页面整体滚动

## 6. 配置与文档

- [x] 6.1 更新 `.env.example`，新增 `AI_ASSISTANT_BASE_URL`、`AI_ASSISTANT_API_KEY`、`AI_ASSISTANT_MODEL` 示例并提醒不要提交真实密钥
- [x] 6.2 更新 README 或 `docs/demo-workflow.md`，说明如何配置 OpenAI-compatible API 并启动 AI 助手
- [x] 6.3 确认真实 `.env` 继续被忽略，文档中不包含真实 API key

## 7. 验证

- [x] 7.1 运行 `UV_CACHE_DIR=/tmp/uv-cache uv run --group dev pytest`
- [x] 7.2 运行 `cd frontend && npm test`
- [x] 7.3 运行 `cd frontend && npm run build`
- [x] 7.4 手动验证首页：生成或恢复规划结果，打开 AI 助手，发送问题，确认流式输出、多轮指代和规划变化清空行为
