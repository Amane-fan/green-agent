from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass
from typing import Any

import httpx

from app.models import AIAssistantMessage, PlanningRecordDetail


@dataclass(frozen=True)
class AIAssistantConfig:
    base_url: str
    api_key: str
    model: str


class AIAssistantConfigError(RuntimeError):
    def __init__(self, missing_keys: list[str]) -> None:
        self.missing_keys = missing_keys
        super().__init__(f"AI assistant configuration is missing: {', '.join(missing_keys)}")


class AIModelError(RuntimeError):
    pass


def read_ai_assistant_config(
    environ: Mapping[str, str] | None = None,
) -> AIAssistantConfig:
    source = environ if environ is not None else os.environ
    raw_values = {
        "AI_ASSISTANT_BASE_URL": source.get("AI_ASSISTANT_BASE_URL", "").strip(),
        "AI_ASSISTANT_API_KEY": source.get("AI_ASSISTANT_API_KEY", "").strip(),
        "AI_ASSISTANT_MODEL": source.get("AI_ASSISTANT_MODEL", "").strip(),
    }
    missing = [key for key, value in raw_values.items() if not value]
    if missing:
        raise AIAssistantConfigError(missing)

    return AIAssistantConfig(
        base_url=raw_values["AI_ASSISTANT_BASE_URL"].rstrip("/"),
        api_key=raw_values["AI_ASSISTANT_API_KEY"],
        model=raw_values["AI_ASSISTANT_MODEL"],
    )


def build_planning_context(record: PlanningRecordDetail) -> str:
    scenario = record.scenario
    plan = record.plan
    node_by_id = {node.id: node for node in scenario.nodes}
    vehicle_by_id = {vehicle.id: vehicle for vehicle in scenario.vehicles}
    facility_by_id = {facility.id: facility for facility in scenario.facilities}

    summary: dict[str, Any] = {
        "record": {
            "id": record.summary.id,
            "title": record.summary.title,
            "scenario_id": record.summary.scenario_id,
            "scenario_name": record.summary.scenario_name,
            "simulation_time": record.summary.simulation_time,
            "seed": record.summary.seed,
            "threshold": record.summary.threshold,
            "created_at": record.summary.created_at,
        },
        "metrics": {
            "总距离": round(plan.total_distance, 2),
            "总油耗": round(plan.estimated_fuel, 2),
            "总碳排放": round(plan.estimated_carbon, 2),
            "total_distance_text": f"{plan.total_distance:.2f} km",
            "estimated_fuel_text": f"{plan.estimated_fuel:.2f} L",
            "estimated_carbon_text": f"{plan.estimated_carbon:.2f} kg",
            "route_count": len(plan.routes),
            "unassigned_count": len(plan.unassigned_tasks),
        },
        "routes": [],
        "unassigned_tasks": [
            {
                "bin_id": task.bin_id,
                "reason": task.reason,
                "message": task.message,
            }
            for task in plan.unassigned_tasks
        ],
        "warnings": plan.warnings,
        "scenario_snapshot": {
            "current_time": scenario.current_time,
            "nodes": [
                {
                    "id": node.id,
                    "type": node.type,
                    "lat": round(node.lat, 6),
                    "lng": round(node.lng, 6),
                    "waste_type": node.waste_type,
                    "fill_rate": node.fill_rate,
                    "capacity": node.capacity,
                    "fill_trend": node.fill_trend.model_dump(mode="json")
                    if node.fill_trend
                    else None,
                }
                for node in scenario.nodes
            ],
            "vehicles": [
                {
                    "id": vehicle.id,
                    "node_id": vehicle.node_id,
                    "supported_waste_type": vehicle.supported_waste_type,
                    "capacity": vehicle.capacity,
                    "fuel_per_km": vehicle.fuel_per_km,
                }
                for vehicle in scenario.vehicles
            ],
            "facilities": [
                {
                    "id": facility.id,
                    "node_id": facility.node_id,
                    "accepted_waste_types": facility.accepted_waste_types,
                    "capacity": facility.capacity,
                }
                for facility in scenario.facilities
            ],
            "edges": [
                {
                    "source": edge.source,
                    "target": edge.target,
                    "weight": round(edge.weight, 3),
                }
                for edge in scenario.edges
            ],
            "validation": scenario.validation.model_dump(mode="json"),
        },
        "trace": [
            {
                "agent": step.agent,
                "message": step.message,
                "data": step.data,
            }
            for step in plan.trace
        ],
    }

    for route in plan.routes:
        vehicle = vehicle_by_id.get(route.vehicle_id)
        facility = facility_by_id.get(route.facility_id)
        summary["routes"].append(
            {
                "vehicle_id": route.vehicle_id,
                "vehicle": vehicle.model_dump(mode="json") if vehicle else None,
                "start_node_id": vehicle.node_id if vehicle else None,
                "facility_id": route.facility_id,
                "facility_node_id": facility.node_id if facility else None,
                "stops": [
                    {
                        "node_id": stop.node_id,
                        "node_type": stop.node_type,
                        "order": stop.order,
                        "fill_rate": stop.fill_rate,
                    }
                    for stop in sorted(route.stops, key=lambda item: item.order)
                ],
                "path_node_ids": route.path_node_ids,
                "path_nodes": [
                    node_by_id[node_id].model_dump(mode="json")
                    for node_id in route.path_node_ids
                    if node_id in node_by_id
                ],
                "distance": round(route.distance, 2),
                "estimated_fuel": round(route.estimated_fuel, 2),
                "estimated_carbon": round(route.estimated_carbon, 2),
            }
        )

    return (
        "以下 JSON 是当前首页正在展示的完整规划结果事实摘要。"
        "回答必须只依据该摘要；如果摘要中没有依据，请说明无法从当前规划结果判断。\n"
        f"{json.dumps(summary, ensure_ascii=False, indent=2)}"
    )


def encode_sse_event(event: Mapping[str, Any]) -> str:
    payload = json.dumps(
        {key: value for key, value in event.items() if value is not None},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return f"data: {payload}\n\n"


async def stream_openai_chat_completions(
    config: AIAssistantConfig,
    planning_context: str,
    messages: list[AIAssistantMessage],
) -> AsyncIterator[dict[str, Any]]:
    url = f"{config.base_url}/chat/completions"
    payload = {
        "model": config.model,
        "stream": True,
        "temperature": 0.2,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是绿运先锋路线规划解释助手。"
                    "你只能解释给定规划上下文，不得修改路线或编造规划数据。\n\n"
                    f"{planning_context}"
                ),
            },
            *[
                {
                    "role": message.role,
                    "content": message.content,
                }
                for message in messages[-12:]
            ],
        ],
    }
    headers = {
        "Authorization": f"Bearer {config.api_key}",
        "Content-Type": "application/json",
    }
    timeout = httpx.Timeout(60.0, connect=10.0)
    done_sent = False

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code >= 400:
                    body = (await response.aread()).decode("utf-8", errors="replace")
                    raise AIModelError(f"模型接口返回 {response.status_code}: {body[:500]}")

                async for line in response.aiter_lines():
                    parsed = _parse_openai_sse_line(line)
                    if parsed is None:
                        continue
                    if parsed.get("done"):
                        done_sent = True
                    yield parsed
    except httpx.HTTPError as exc:
        raise AIModelError(f"模型接口调用失败: {exc}") from exc

    if not done_sent:
        yield {"done": True}


def _parse_openai_sse_line(line: str) -> dict[str, Any] | None:
    stripped = line.strip()
    if not stripped or not stripped.startswith("data:"):
        return None

    data = stripped.removeprefix("data:").strip()
    if data == "[DONE]":
        return {"done": True}

    try:
        payload = json.loads(data)
    except json.JSONDecodeError:
        return None

    if payload.get("error"):
        error = payload["error"]
        message = error.get("message") if isinstance(error, dict) else str(error)
        raise AIModelError(message)

    choices = payload.get("choices")
    if not choices:
        return None

    choice = choices[0]
    delta = choice.get("delta", {}) if isinstance(choice, dict) else {}
    content = delta.get("content")
    if content:
        return {"delta": content}
    if choice.get("finish_reason"):
        return {"done": True}
    return None
