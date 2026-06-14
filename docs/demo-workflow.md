# 绿运先锋演示流程

## 本地启动

后端：

```bash
make dev-backend
```

前端：

```bash
make dev-frontend
```

默认后端地址为 `http://127.0.0.1:8000`，前端地址为 `http://127.0.0.1:5173`。

如需使用 MySQL 持久化规划历史，先启动 Docker 容器：

```bash
docker run -d \
  --name green-agent-mysql \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=135790 \
  -e MYSQL_DATABASE=green_agent \
  -v green-agent-mysql-data:/var/lib/mysql \
  mysql:8.4
```

然后在启动后端前设置数据库连接：

```bash
export GREEN_AGENT_DATABASE_URL='mysql+pymysql://root:135790@127.0.0.1:3306/green_agent?charset=utf8mb4'
make dev-backend
```

## 页面演示顺序

1. 打开前端页面，查看 React Leaflet 地图、场景统计和规划结果面板。
2. 输入随机种子，例如 `202612`，点击“随机生成场景”。
3. 确认场景包含 30 个垃圾桶、5 辆车、3 个处理厂，图状态为“可规划”。
4. 点击“推进时间”，观察垃圾桶满溢率状态刷新。
5. 点击“规划路线”，查看不同颜色车辆路线、总距离、油耗、碳排放和任务顺序；本次成功规划会自动写入“规划历史”。
6. 在“规划历史”中选择一条记录，确认地图恢复该记录保存的图结构和车辆线路。
7. 恢复记录后继续点击“推进时间”或编辑图结构，确认旧规划结果被清空；再次点击“规划路线”会基于恢复后的当前场景创建新历史记录。
8. 使用“添加垃圾桶 / 添加车辆 / 添加处理厂 / 添加边”演示自定义图编辑。

## API 示例

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

查看单条规划记录：

```bash
curl http://127.0.0.1:8000/api/planning-records/1
```

恢复规划记录为当前场景：

```bash
curl -X POST http://127.0.0.1:8000/api/planning-records/1/restore
```

重置场景：

```bash
curl -X POST http://127.0.0.1:8000/api/scenarios/reset \
  -H 'Content-Type: application/json' \
  -d '{"seed": 202613}'
```

FastAPI 自动文档：

```text
http://127.0.0.1:8000/docs
```
