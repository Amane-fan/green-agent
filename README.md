# 绿运先锋

SE2026-12 绿运先锋——垃圾分类收运多智能体路径优化系统。

## 本地运行

后端：

```bash
uv sync
uv run uvicorn app.main:app --reload
```

前端：

```bash
cd frontend
npm install
npm run dev
```

使用 Docker MySQL 持久化规划历史：

```bash
docker run -d \
  --name green-agent-mysql \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=135790 \
  -e MYSQL_DATABASE=green_agent \
  -v green-agent-mysql-data:/var/lib/mysql \
  mysql:8.4

cp .env.example .env
# 编辑 .env，启用并按需修改：
# GREEN_AGENT_DATABASE_URL=mysql+pymysql://root:135790@127.0.0.1:3306/green_agent?charset=utf8mb4
uv run uvicorn app.main:app --reload
```

后端启动时会加载项目根目录 `.env`。真实 `.env` 不应提交到仓库；`.env.example` 只保留示例值。未设置 `GREEN_AGENT_DATABASE_URL` 时，后端使用本地 SQLite fallback，适合测试和快速演示；如需固定 SQLite 文件路径，可在 `.env` 中设置 `GREEN_AGENT_DB_PATH`。

启用首页 AI 规划助手时，在服务端 `.env` 中配置 OpenAI-compatible Chat Completions streaming API：

```bash
AI_ASSISTANT_BASE_URL=https://api.example.com/v1
AI_ASSISTANT_API_KEY=replace-with-your-server-side-key
AI_ASSISTANT_MODEL=your-chat-model
```

`AI_ASSISTANT_API_KEY` 只由后端读取，不会发送到前端。未配置时，AI 助手接口会返回明确的配置错误；不要把真实密钥写入 README、`.env.example` 或前端环境变量。

测试：

```bash
uv run pytest
cd frontend && npm test
```

统一脚本：

```bash
make dev-backend
make dev-frontend
make test
```

更多演示步骤和 API 示例见 [docs/demo-workflow.md](docs/demo-workflow.md)。
