import asyncio
import json

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.knowledge import KnowledgePool
from app.models import (
    AgentTraceStep,
    AIAssistantChatRequest,
    AIAssistantMessage,
    PlanningResult,
    RouteStop,
    UnassignedTask,
    VehicleRoute,
)
from app.scenario import generate_random_scenario
from app.ai_assistant import (
    AIAssistantConfigError,
    AIModelError,
    build_planning_context,
    read_ai_assistant_config,
)


def make_planning_record(tmp_path):
    pool = KnowledgePool(tmp_path / "knowledge.sqlite")
    scenario = generate_random_scenario(seed=55, vehicle_count=2, facility_count=2)
    first_bin, second_bin, third_bin = scenario.bin_nodes[:3]
    first_vehicle, second_vehicle = scenario.vehicles[:2]
    first_facility, second_facility = scenario.facilities[:2]

    plan = PlanningResult(
        routes=[
            VehicleRoute(
                vehicle_id=first_vehicle.id,
                color=first_vehicle.color,
                facility_id=first_facility.id,
                stops=[
                    RouteStop(node_id=first_bin.id, node_type="bin", order=1, fill_rate=91),
                    RouteStop(node_id=first_facility.node_id, node_type="facility", order=2),
                ],
                path_node_ids=[first_vehicle.node_id, first_bin.id, first_facility.node_id],
                distance=4.25,
                estimated_fuel=0.85,
                estimated_carbon=1.96,
            ),
            VehicleRoute(
                vehicle_id=second_vehicle.id,
                color=second_vehicle.color,
                facility_id=second_facility.id,
                stops=[
                    RouteStop(node_id=second_bin.id, node_type="bin", order=1, fill_rate=88),
                    RouteStop(node_id=second_facility.node_id, node_type="facility", order=2),
                ],
                path_node_ids=[second_vehicle.node_id, second_bin.id, second_facility.node_id],
                distance=5.75,
                estimated_fuel=1.44,
                estimated_carbon=3.33,
            ),
        ],
        unassigned_tasks=[
            UnassignedTask(
                bin_id=third_bin.id,
                reason="capacity",
                message="车辆容量不足，无法加入当前路线",
            )
        ],
        total_distance=10.0,
        estimated_fuel=2.29,
        estimated_carbon=5.29,
        warnings=["存在未分配任务"],
        trace=[
            AgentTraceStep(
                agent="monitoring",
                message="found eligible bins",
                data={"eligible": [first_bin.id, second_bin.id, third_bin.id]},
            ),
            AgentTraceStep(
                agent="task_orchestrator",
                message="assigned two routes",
                data={"route_count": 2},
            ),
        ],
    )
    record = pool.record_planning_result(scenario, plan, seed=55, threshold=70)
    return pool, record


def test_ai_assistant_request_requires_messages_and_last_user_message():
    valid = AIAssistantChatRequest(
        record_id=1,
        messages=[AIAssistantMessage(role="user", content="为什么第一辆车距离最长？")],
    )

    assert valid.messages[-1].role == "user"

    with pytest.raises(ValidationError):
        AIAssistantChatRequest(record_id=1, messages=[])

    with pytest.raises(ValidationError):
        AIAssistantChatRequest(
            record_id=1,
            messages=[AIAssistantMessage(role="assistant", content="上一轮回答")],
        )

    with pytest.raises(ValidationError):
        AIAssistantChatRequest(
            record_id=1,
            messages=[AIAssistantMessage(role="user", content="   ")],
        )


def test_read_ai_assistant_config_reads_environment_and_reports_missing(monkeypatch):
    monkeypatch.setenv("AI_ASSISTANT_BASE_URL", " https://api.example.com/v1/ ")
    monkeypatch.setenv("AI_ASSISTANT_API_KEY", "secret-key")
    monkeypatch.setenv("AI_ASSISTANT_MODEL", "demo-model")

    config = read_ai_assistant_config()

    assert config.base_url == "https://api.example.com/v1"
    assert config.api_key == "secret-key"
    assert config.model == "demo-model"

    monkeypatch.delenv("AI_ASSISTANT_API_KEY")

    with pytest.raises(AIAssistantConfigError) as exc_info:
        read_ai_assistant_config()

    assert "AI_ASSISTANT_API_KEY" in str(exc_info.value)


def test_build_planning_context_includes_full_record_scope(tmp_path):
    _, record = make_planning_record(tmp_path)

    context = build_planning_context(record)

    assert record.summary.title in context
    assert record.scenario.id in context
    assert record.plan.routes[0].vehicle_id in context
    assert record.plan.routes[1].vehicle_id in context
    assert record.plan.routes[0].path_node_ids[1] in context
    assert record.plan.routes[1].path_node_ids[1] in context
    assert record.plan.unassigned_tasks[0].bin_id in context
    assert "capacity" in context
    assert "总距离" in context
    assert "10.00" in context
    assert "存在未分配任务" in context
    assert "monitoring" in context
    assert "task_orchestrator" in context
    assert "nodes" in context
    assert "edges" in context


def test_post_ai_assistant_chat_stream_returns_sse_for_known_record(monkeypatch, tmp_path):
    pool, record = make_planning_record(tmp_path)
    seen = {}

    async def fake_stream(config, context, messages):
        seen["config"] = config
        seen["context"] = context
        seen["messages"] = messages
        yield {"delta": "第一段"}
        yield {"delta": "第二段"}
        yield {"done": True}

    import app.main as main

    monkeypatch.setattr(main, "knowledge_pool", pool)
    monkeypatch.setattr(
        main,
        "read_ai_assistant_config",
        lambda: type("Config", (), {"base_url": "https://api.example.com/v1", "api_key": "key", "model": "model"})(),
    )
    monkeypatch.setattr(main, "stream_openai_chat_completions", fake_stream)

    response = asyncio.run(
        main.post_ai_assistant_chat_stream(
            AIAssistantChatRequest(
                record_id=record.summary.id,
                messages=[AIAssistantMessage(role="user", content="总结这次规划")],
            )
        )
    )
    body = asyncio.run(collect_streaming_response(response))

    assert response.media_type == "text/event-stream"
    assert 'data: {"delta":"第一段"}' in body
    assert 'data: {"delta":"第二段"}' in body
    assert 'data: {"done":true}' in body
    assert record.plan.routes[0].vehicle_id in seen["context"]
    assert seen["messages"][-1].content == "总结这次规划"


def test_post_ai_assistant_chat_stream_reports_errors_without_calling_model(
    monkeypatch,
    tmp_path,
):
    pool, record = make_planning_record(tmp_path)
    called = False

    async def fake_stream(config, context, messages):
        nonlocal called
        called = True
        yield {"delta": "不应调用"}

    import app.main as main

    monkeypatch.setattr(main, "knowledge_pool", pool)
    monkeypatch.setattr(main, "stream_openai_chat_completions", fake_stream)

    with pytest.raises(HTTPException) as missing_record:
        asyncio.run(
            main.post_ai_assistant_chat_stream(
                AIAssistantChatRequest(
                    record_id=record.summary.id + 1000,
                    messages=[AIAssistantMessage(role="user", content="不存在记录")],
                )
            )
        )

    assert missing_record.value.status_code == 404
    assert called is False

    monkeypatch.setattr(
        main,
        "read_ai_assistant_config",
        lambda: (_ for _ in ()).throw(AIAssistantConfigError(["AI_ASSISTANT_MODEL"])),
    )

    with pytest.raises(HTTPException) as config_error:
        asyncio.run(
            main.post_ai_assistant_chat_stream(
                AIAssistantChatRequest(
                    record_id=record.summary.id,
                    messages=[AIAssistantMessage(role="user", content="配置缺失")],
                )
            )
        )

    assert config_error.value.status_code == 503
    assert "AI_ASSISTANT_MODEL" in str(config_error.value.detail)
    assert called is False


def test_post_ai_assistant_chat_stream_converts_upstream_model_error(monkeypatch, tmp_path):
    pool, record = make_planning_record(tmp_path)

    async def fake_stream(config, context, messages):
        raise AIModelError("上游模型暂不可用")
        yield {"delta": "unreachable"}

    import app.main as main

    monkeypatch.setattr(main, "knowledge_pool", pool)
    monkeypatch.setattr(
        main,
        "read_ai_assistant_config",
        lambda: type("Config", (), {"base_url": "https://api.example.com/v1", "api_key": "key", "model": "model"})(),
    )
    monkeypatch.setattr(main, "stream_openai_chat_completions", fake_stream)

    response = asyncio.run(
        main.post_ai_assistant_chat_stream(
            AIAssistantChatRequest(
                record_id=record.summary.id,
                messages=[AIAssistantMessage(role="user", content="解释失败原因")],
            )
        )
    )
    body = asyncio.run(collect_streaming_response(response))

    assert 'data: {"error":"上游模型暂不可用"}' in body


async def collect_streaming_response(response) -> str:
    chunks = []
    async for chunk in response.body_iterator:
        chunks.append(chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk)
    return "".join(chunks)
