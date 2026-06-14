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
