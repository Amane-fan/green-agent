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
