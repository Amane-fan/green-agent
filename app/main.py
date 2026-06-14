from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.ai_assistant import (
    AIAssistantConfigError,
    AIModelError,
    build_planning_context,
    encode_sse_event,
    read_ai_assistant_config,
    stream_openai_chat_completions,
)
from app.graph import validate_graph
from app.knowledge import KnowledgePool
from app.models import (
    AIAssistantChatRequest,
    PlanningRecordDetail,
    PlanningRecordRenameRequest,
    PlanningRecordRestoreResponse,
    PlanningRecordSummary,
    PlanningRequest,
    Scenario,
    ScenarioGenerateRequest,
    TimeAdvanceRequest,
)
from app.orchestration import run_planning_workflow
from app.scenario import generate_random_scenario
from app.simulation import advance_time, compute_predictions


def load_environment_config(env_path: str | Path | None = None) -> None:
    dotenv_path = Path(env_path) if env_path is not None else Path(__file__).resolve().parents[1] / ".env"
    load_dotenv(dotenv_path=dotenv_path, override=False)


load_environment_config()

app = FastAPI(title="绿运先锋 API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

default_db_path = Path(os.getenv("GREEN_AGENT_DB_PATH", f"/tmp/green-agent-demo-{os.getpid()}.sqlite"))
database_url = os.getenv("GREEN_AGENT_DATABASE_URL")
knowledge_pool = KnowledgePool(default_db_path, database_url=database_url)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/scenarios/current", response_model=Scenario)
def get_current_scenario() -> Scenario:
    scenario = knowledge_pool.get_active_scenario()
    if scenario is None:
        scenario = generate_random_scenario(seed=202612)
        knowledge_pool.replace_active_scenario(scenario)
    return scenario


@app.put("/api/scenarios/current", response_model=Scenario)
def put_current_scenario(scenario: Scenario) -> Scenario:
    scenario.validation = validate_graph(scenario)
    knowledge_pool.replace_active_scenario(scenario)
    return scenario


@app.post("/api/scenarios/random", response_model=Scenario)
def post_random_scenario(request: ScenarioGenerateRequest) -> Scenario:
    scenario = generate_random_scenario(
        seed=request.seed,
        bin_count=request.bin_count,
        vehicle_count=request.vehicle_count,
        facility_count=request.facility_count,
    )
    knowledge_pool.replace_active_scenario(scenario)
    return scenario


@app.post("/api/scenarios/reset", response_model=Scenario)
def post_reset_scenario(request: ScenarioGenerateRequest) -> Scenario:
    knowledge_pool.reset()
    scenario = generate_random_scenario(
        seed=request.seed,
        bin_count=request.bin_count,
        vehicle_count=request.vehicle_count,
        facility_count=request.facility_count,
    )
    knowledge_pool.replace_active_scenario(scenario)
    return scenario


@app.post("/api/simulation/advance", response_model=Scenario)
def post_advance_time(request: TimeAdvanceRequest) -> Scenario:
    scenario = knowledge_pool.get_active_scenario()
    if scenario is None:
        scenario = generate_random_scenario(seed=202612)
    scenario = advance_time(scenario, steps=request.steps)
    knowledge_pool.replace_active_scenario(scenario)
    knowledge_pool.record_fill_history(scenario)
    knowledge_pool.record_predictions(scenario.id, compute_predictions(scenario, horizon=3))
    return scenario


@app.post("/api/planning/routes")
def post_plan_routes(request: PlanningRequest):
    scenario = knowledge_pool.get_active_scenario()
    if scenario is None:
        scenario = generate_random_scenario(seed=202612)
        knowledge_pool.replace_active_scenario(scenario)

    validation = validate_graph(scenario)
    if not validation.is_valid:
        raise HTTPException(status_code=400, detail=validation.model_dump(mode="json"))

    result = run_planning_workflow(
        scenario,
        seed=request.seed,
        threshold=request.threshold,
    )
    record = knowledge_pool.record_planning_result(
        scenario,
        result,
        seed=request.seed,
        threshold=request.threshold,
    )
    return record.plan


@app.get("/api/planning-records", response_model=list[PlanningRecordSummary])
def get_planning_records() -> list[PlanningRecordSummary]:
    return knowledge_pool.list_planning_records()


@app.get("/api/planning-records/{record_id}", response_model=PlanningRecordDetail)
def get_planning_record(record_id: int) -> PlanningRecordDetail:
    try:
        return knowledge_pool.get_planning_record(record_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/api/planning-records/{record_id}", response_model=PlanningRecordSummary)
def patch_planning_record(
    record_id: int,
    request: PlanningRecordRenameRequest,
) -> PlanningRecordSummary:
    try:
        return knowledge_pool.rename_planning_record(record_id, request.title)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/planning-records/{record_id}/restore", response_model=PlanningRecordRestoreResponse)
def post_restore_planning_record(record_id: int) -> PlanningRecordRestoreResponse:
    try:
        return knowledge_pool.restore_planning_record(record_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/ai-assistant/chat/stream")
async def post_ai_assistant_chat_stream(request: AIAssistantChatRequest) -> StreamingResponse:
    try:
        record = knowledge_pool.get_planning_record(request.record_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        config = read_ai_assistant_config()
    except AIAssistantConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    planning_context = build_planning_context(record)

    async def event_stream():
        try:
            async for event in stream_openai_chat_completions(
                config,
                planning_context,
                request.messages,
            ):
                yield encode_sse_event(event)
        except AIModelError as exc:
            yield encode_sse_event({"error": str(exc)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
