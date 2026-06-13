import pytest
from fastapi import HTTPException

from app.main import (
    post_advance_time,
    post_plan_routes,
    post_random_scenario,
    post_reset_scenario,
    put_current_scenario,
)
from app.models import PlanningRequest, ScenarioGenerateRequest, TimeAdvanceRequest
from app.orchestration import run_planning_workflow
from app.scenario import generate_random_scenario


def test_workflow_returns_trace_and_is_deterministic():
    scenario = generate_random_scenario(seed=7)
    for node in scenario.bin_nodes:
        node.fill_rate = 85

    first = run_planning_workflow(scenario, seed=123)
    second = run_planning_workflow(scenario, seed=123)

    assert first.model_dump(mode="json") == second.model_dump(mode="json")
    assert [step.agent for step in first.trace] == [
        "monitoring",
        "knowledge",
        "task_orchestrator",
        "reachability",
        "vehicle_facility",
    ]


def test_api_generates_scenario_advances_time_and_plans_routes():
    generated = post_random_scenario(ScenarioGenerateRequest(seed=202612))
    assert len(generated.bin_nodes) == 30

    advanced = post_advance_time(TimeAdvanceRequest(steps=1))
    assert advanced.current_time == 1

    planned = post_plan_routes(PlanningRequest(seed=202612, threshold=70))
    assert planned.routes
    assert planned.trace


def test_api_rejects_invalid_graph_before_planning():
    scenario = generate_random_scenario(seed=8)
    isolated = scenario.bin_nodes[0].id
    scenario.edges = [edge for edge in scenario.edges if isolated not in {edge.source, edge.target}]

    loaded = put_current_scenario(scenario)
    assert loaded.validation.is_valid is False

    with pytest.raises(HTTPException) as exc_info:
        post_plan_routes(PlanningRequest(seed=1, threshold=70))

    assert exc_info.value.status_code == 400
    assert isolated in exc_info.value.detail["disconnected_nodes"]


def test_api_resets_scenario_context():
    generated = post_random_scenario(ScenarioGenerateRequest(seed=100))
    assert generated.id == "scenario-100"
    advanced = post_advance_time(TimeAdvanceRequest(steps=2))
    assert advanced.current_time == 2

    reset = post_reset_scenario(ScenarioGenerateRequest(seed=101))

    assert reset.id == "scenario-101"
    assert reset.current_time == 0
