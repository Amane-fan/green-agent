# AI Planning Assistant Specification

## Purpose

定义首页 AI 助手入口、规划结果上下文、页面内多轮对话、后端流式聊天接口、OpenAI-compatible 配置和流式体验。

## Requirements

### Requirement: 首页 AI 助手入口
前端 SHALL 在首页提供右下角 AI 助手悬浮球，用户点击后 SHALL 展开一个可关闭的 AI 对话框。

#### Scenario: 打开 AI 对话框
- **WHEN** 用户在首页点击 AI 助手悬浮球
- **THEN** 前端展示 AI 对话框、消息列表、输入框和发送入口

#### Scenario: 关闭 AI 对话框
- **WHEN** AI 对话框已经展开且用户触发关闭操作
- **THEN** 前端收起对话框并保留当前页面内已有对话消息

### Requirement: 当前完整规划结果作用域
AI 助手 SHALL 只围绕当前首页正在展示的完整规划结果回答问题，且上下文 SHALL 包含该规划结果中的所有车辆路线、未分配任务、聚合指标、场景快照和规划 trace，不受当前地图高亮车辆限制。

#### Scenario: 使用所有车辆路线作为上下文
- **WHEN** 当前规划结果包含多条车辆路线且用户只在地图上高亮其中一条路线
- **THEN** AI 助手请求上下文仍包含当前规划结果中的全部车辆路线

#### Scenario: 没有当前规划结果时禁止提问
- **WHEN** 首页尚未展示带有 `record_id` 的规划结果
- **THEN** AI 对话框提示用户先执行或恢复路线规划，并且前端不向聊天接口发送问题

### Requirement: 页面内多轮对话上下文
前端 SHALL 在当前页面内保存 AI 助手多轮消息，并在每次提问时向后端发送当前问题和最近对话历史；系统 MUST NOT 将聊天消息持久化到数据库或规划记录中。

#### Scenario: 后续问题携带页面内历史
- **WHEN** 用户已经在 AI 对话框中完成至少一轮问答并继续提问
- **THEN** 前端向聊天接口发送当前问题以及页面内保留的最近对话消息

#### Scenario: 刷新后不恢复聊天历史
- **WHEN** 用户刷新页面并重新打开 AI 助手
- **THEN** 前端不恢复刷新前的聊天消息

#### Scenario: 规划上下文变化后清空聊天
- **WHEN** 用户重新规划、恢复另一条历史记录、推进时间或编辑图结构导致当前规划结果变化或清空
- **THEN** 前端清空 AI 助手的页面内消息

### Requirement: 后端流式聊天接口
后端 SHALL 提供 `POST /api/ai-assistant/chat/stream` 接口，接收当前规划记录 ID 和对话消息，读取该规划记录快照后通过 `text/event-stream` 流式返回 AI 回复。

#### Scenario: 成功流式返回回答
- **WHEN** 前端提交存在的 `record_id` 和有效对话消息，且 AI 助手配置完整
- **THEN** 后端读取对应规划记录的 `scenario` 和 `plan`，调用 OpenAI-compatible streaming API，并以 `text/event-stream` 逐段返回回复内容

#### Scenario: 规划记录不存在
- **WHEN** 前端提交不存在的 `record_id`
- **THEN** 后端返回 `404` 错误且不调用外部模型 API

#### Scenario: 请求消息为空
- **WHEN** 前端提交空消息列表或最后一条用户消息为空白
- **THEN** 后端返回校验错误且不调用外部模型 API

### Requirement: OpenAI-compatible 配置
后端 MUST 从环境变量读取 `AI_ASSISTANT_BASE_URL`、`AI_ASSISTANT_API_KEY` 和 `AI_ASSISTANT_MODEL`，并 MUST 只在服务端使用这些配置调用 OpenAI-compatible Chat Completions API。

#### Scenario: AI 配置完整
- **WHEN** `.env` 或进程环境变量提供了 `AI_ASSISTANT_BASE_URL`、`AI_ASSISTANT_API_KEY` 和 `AI_ASSISTANT_MODEL`
- **THEN** 后端使用这些配置构造 Chat Completions streaming 请求

#### Scenario: AI 配置缺失
- **WHEN** 任一 AI 助手配置项缺失
- **THEN** 后端返回明确的配置错误且不调用外部模型 API

#### Scenario: API key 不暴露给前端
- **WHEN** 前端调用 AI 助手接口
- **THEN** 请求和响应中不包含 `AI_ASSISTANT_API_KEY`

### Requirement: 流式输出体验和错误反馈
前端 SHALL 在 AI 助手对话框中逐段追加后端流式返回内容，并 SHALL 在接口或流式调用失败时展示可理解错误。

#### Scenario: 逐段展示 AI 回复
- **WHEN** 后端流式返回多个回复片段
- **THEN** 前端将这些片段追加到同一条 AI 消息中展示

#### Scenario: 流式调用失败
- **WHEN** 聊天接口返回错误或流式响应中断
- **THEN** 前端保留用户消息，展示失败状态，并允许用户再次发送问题

#### Scenario: 发送期间防止重复提交
- **WHEN** AI 助手正在等待或接收流式回复
- **THEN** 前端禁用当前发送操作，直到本次回复完成或失败
