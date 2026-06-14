# 绿运先锋 ♻️

SE2026-12 绿运先锋——垃圾分类收运多智能体路径优化系统。

这是一个面向城市垃圾分类收运场景的实验系统：将垃圾桶、收运车辆、处理厂和道路关系抽象为图结构，结合垃圾桶满溢率预测、车辆容量、垃圾类别匹配和路径距离，生成可解释的多车辆收运路线。系统同时提供地图可视化、规划历史持久化和可选的 AI 规划助手，便于演示、分析和迭代调度策略。

## ✨ 核心能力

- 🗺️ **地图场景管理**：随机生成或手动编辑垃圾桶、车辆、处理厂和道路边。
- 🤖 **多智能体规划流程**：基于 `LangGraph` 编排监测、知识、任务调度、可达性和车辆设施匹配等步骤。
- 📈 **满溢率模拟与预测**：推进模拟时间，识别当前或未来可能达到阈值的垃圾桶。
- 🚛 **分类收运路径规划**：按垃圾类别、车辆能力、处理厂接收范围和容量约束生成路线。
- 📊 **路线指标展示**：展示总距离、预估油耗、预估碳排放和未分配任务原因。
- 🕘 **规划历史**：保存、重命名、查看并恢复历史规划结果。
- 💬 **AI 规划助手**：可选接入 OpenAI-compatible Chat Completions streaming API，围绕规划结果进行问答。

## 🧱 技术栈

- 后端：`Python 3.12+`、`FastAPI`、`Pydantic`、`LangGraph`、`NetworkX`
- 前端：`React 19`、`TypeScript`、`Vite`、`React Leaflet`
- 存储：默认 SQLite fallback，可选 `MySQL 8.4`
- 测试：`pytest`、`Vitest`、`Testing Library`
- 包管理：后端使用 `uv`，前端使用 `npm`

## 📁 项目结构

```text
.
├── app/                    # FastAPI 后端、领域模型、规划流程和存储逻辑
├── frontend/               # React + Vite 前端
├── tests/                  # 后端测试
├── docs/                   # 演示流程与补充文档
├── openspec/               # 需求规格与变更记录
├── .env.example            # 本地环境变量示例
├── Makefile                # 常用开发命令
├── pyproject.toml          # Python 项目配置
└── README.md
```

## 🚀 快速启动

### 1. 准备环境

请先确认本机已安装：

- `Python >= 3.12`
- `uv`
- `Node.js` 和 `npm`
- 可选：`Docker`，用于启动 MySQL 持久化数据库

### 2. 安装依赖

后端：

```bash
uv sync --group dev
```

前端：

```bash
cd frontend
npm install
cd ..
```

### 3. 启动后端

```bash
make dev-backend
```

等价命令：

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端默认地址：

```text
http://127.0.0.1:8000
```

FastAPI 自动文档：

```text
http://127.0.0.1:8000/docs
```

### 4. 启动前端

另开一个终端：

```bash
make dev-frontend
```

等价命令：

```bash
cd frontend
npm run dev
```

前端默认地址：

```text
http://127.0.0.1:5173
```

Vite 开发服务器默认会把 `/api` 代理到 `http://127.0.0.1:8000`。如需修改代理目标，可在 `frontend` 目录启动前设置：

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:8000 npm run dev
```

## ⚙️ 环境变量

后端启动时会自动加载项目根目录下的 `.env`。可以从示例文件复制：

```bash
cp .env.example .env
```

常用变量：

| 变量名 | 作用 | 是否必需 |
| --- | --- | --- |
| `GREEN_AGENT_DATABASE_URL` | MySQL 连接串，用于持久化活动场景、模拟历史、预测和规划记录 | 否 |
| `GREEN_AGENT_DB_PATH` | 未设置 MySQL 时的 SQLite 文件路径 | 否 |
| `AI_ASSISTANT_BASE_URL` | OpenAI-compatible API 地址 | 启用 AI 助手时需要 |
| `AI_ASSISTANT_API_KEY` | 服务端读取的 AI API 密钥 | 启用 AI 助手时需要 |
| `AI_ASSISTANT_MODEL` | AI 助手使用的模型名 | 启用 AI 助手时需要 |

未设置 `GREEN_AGENT_DATABASE_URL` 时，后端会使用本地 SQLite fallback，适合快速演示和测试。真实 `.env` 不应提交到仓库；`.env.example` 只保留示例值。

`AI_ASSISTANT_API_KEY` 只由后端读取，不会发送到前端。不要把真实密钥写入 README、`.env.example` 或任何前端环境变量。

## 🗄️ 使用 MySQL 持久化

如果需要在重启后保留规划历史，可以使用 Docker 启动 MySQL：

```bash
docker run -d \
  --name green-agent-mysql \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=135790 \
  -e MYSQL_DATABASE=green_agent \
  -v green-agent-mysql-data:/var/lib/mysql \
  mysql:8.4
```

然后在 `.env` 中启用：

```bash
GREEN_AGENT_DATABASE_URL=mysql+pymysql://root:135790@127.0.0.1:3306/green_agent?charset=utf8mb4
```

重新启动后端即可生效。

## 💬 启用 AI 规划助手

在项目根目录 `.env` 中配置 OpenAI-compatible Chat Completions streaming API：

```bash
AI_ASSISTANT_BASE_URL=https://api.example.com/v1
AI_ASSISTANT_API_KEY=replace-with-your-server-side-key
AI_ASSISTANT_MODEL=your-chat-model
```

未配置时，AI 助手接口会返回明确的配置错误，不影响基础场景生成、时间推进、路线规划和历史记录功能。

## 🧪 测试与构建

运行后端测试：

```bash
make test-backend
```

运行前端测试：

```bash
make test-frontend
```

构建前端：

```bash
make build-frontend
```

运行完整检查：

```bash
make test
```

`make test` 会依次执行后端测试、前端测试和前端构建。

## 🧭 演示流程

1. 启动后端和前端。
2. 打开 `http://127.0.0.1:5173`。
3. 输入随机种子，例如 `202612`，点击“随机生成场景”。
4. 点击“推进时间”，观察垃圾桶满溢率变化。
5. 点击“规划路线”，查看车辆路线、任务顺序、距离、油耗和碳排放。
6. 打开“规划历史”，查看、重命名或恢复已有规划结果。
7. 如果已配置 AI 助手，可以围绕当前规划结果提问，例如“为什么这辆车路线最长？”。
8. 使用“添加垃圾桶 / 添加车辆 / 添加处理厂 / 添加边”演示自定义图编辑。

更多演示步骤和 API 示例见 [docs/demo-workflow.md](docs/demo-workflow.md)。

## 🔌 常用 API

健康检查：

```bash
curl http://127.0.0.1:8000/api/health
```

生成随机场景：

```bash
curl -X POST http://127.0.0.1:8000/api/scenarios/random \
  -H 'Content-Type: application/json' \
  -d '{"seed": 202612}'
```

推进模拟时间：

```bash
curl -X POST http://127.0.0.1:8000/api/simulation/advance \
  -H 'Content-Type: application/json' \
  -d '{"steps": 1}'
```

规划路线：

```bash
curl -X POST http://127.0.0.1:8000/api/planning/routes \
  -H 'Content-Type: application/json' \
  -d '{"seed": 202612, "threshold": 70}'
```

查看规划历史：

```bash
curl http://127.0.0.1:8000/api/planning-records
```

## 🛠️ 常见问题

- 前端页面没有数据：确认后端已启动在 `http://127.0.0.1:8000`，并检查 Vite 代理目标。
- AI 助手不可用：确认 `.env` 中已配置 `AI_ASSISTANT_BASE_URL`、`AI_ASSISTANT_API_KEY` 和 `AI_ASSISTANT_MODEL`。
- 规划历史重启后丢失：使用默认临时 SQLite 时可能不会长期保留数据；请配置 `GREEN_AGENT_DB_PATH` 或 `GREEN_AGENT_DATABASE_URL`。
- MySQL 容器启动失败：检查本机 `3306` 端口是否被占用，或是否已有同名 `green-agent-mysql` 容器。
