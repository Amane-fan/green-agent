from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.graph import validate_graph
from app.knowledge import KnowledgePool
from app.models import PlanningRequest, Scenario, ScenarioGenerateRequest, TimeAdvanceRequest
from app.orchestration import run_planning_workflow
from app.scenario import generate_random_scenario
from app.simulation import advance_time, compute_predictions

app = FastAPI(title="绿运先锋 API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

default_db_path = Path(os.getenv("GREEN_AGENT_DB_PATH", f"/tmp/green-agent-demo-{os.getpid()}.sqlite"))
knowledge_pool = KnowledgePool(default_db_path)


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
    return result
