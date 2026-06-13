from __future__ import annotations

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from app.graph import build_graph
from app.models import AgentTraceStep, CollectionEligibility, PlanningResult, PredictionRecord, Scenario
from app.planning import plan_routes
from app.simulation import compute_predictions, identify_collection_eligible_bins


class PlanningState(TypedDict, total=False):
    scenario: Scenario
    seed: int | None
    threshold: float
    predictions: list[PredictionRecord]
    eligible: list[CollectionEligibility]
    trace: list[AgentTraceStep]
    result: PlanningResult


def run_planning_workflow(
    scenario: Scenario,
    *,
    seed: int | None = None,
    threshold: float = 70,
) -> PlanningResult:
    graph = _build_workflow()
    state = graph.invoke(
        {
            "scenario": scenario,
            "seed": seed,
            "threshold": threshold,
            "trace": [],
        }
    )
    return state["result"]


def _build_workflow():
    workflow = StateGraph(PlanningState)
    workflow.add_node("monitoring", _monitoring_agent)
    workflow.add_node("knowledge", _knowledge_agent)
    workflow.add_node("task_orchestrator", _task_orchestrator_agent)
    workflow.add_node("reachability", _reachability_agent)
    workflow.add_node("vehicle_facility", _vehicle_facility_agent)
    workflow.add_edge(START, "monitoring")
    workflow.add_edge("monitoring", "knowledge")
    workflow.add_edge("knowledge", "task_orchestrator")
    workflow.add_edge("task_orchestrator", "reachability")
    workflow.add_edge("reachability", "vehicle_facility")
    workflow.add_edge("vehicle_facility", END)
    return workflow.compile()


def _append_trace(state: PlanningState, step: AgentTraceStep) -> list[AgentTraceStep]:
    return [*(state.get("trace") or []), step]


def _monitoring_agent(state: PlanningState) -> PlanningState:
    scenario = state["scenario"]
    threshold = state.get("threshold", 70)
    predictions = compute_predictions(scenario, horizon=3)
    eligible = identify_collection_eligible_bins(
        scenario,
        threshold=threshold,
        predictions=predictions,
        horizon=3,
    )
    return {
        "predictions": predictions,
        "eligible": eligible,
        "trace": _append_trace(
            state,
            AgentTraceStep(
                agent="monitoring",
                message=f"found {len(eligible)} eligible bins",
                data={"eligible_bin_ids": [item.bin_id for item in eligible]},
            ),
        ),
    }


def _knowledge_agent(state: PlanningState) -> PlanningState:
    predictions = state.get("predictions") or []
    return {
        "trace": _append_trace(
            state,
            AgentTraceStep(
                agent="knowledge",
                message="loaded current scenario and prediction horizon",
                data={"prediction_count": len(predictions)},
            ),
        )
    }


def _task_orchestrator_agent(state: PlanningState) -> PlanningState:
    eligible = state.get("eligible") or []
    return {
        "trace": _append_trace(
            state,
            AgentTraceStep(
                agent="task_orchestrator",
                message="grouped eligible bins by garbage category",
                data={"eligible_count": len(eligible)},
            ),
        )
    }


def _reachability_agent(state: PlanningState) -> PlanningState:
    scenario = state["scenario"]
    return {
        "trace": _append_trace(
            state,
            AgentTraceStep(
                agent="reachability",
                message="prepared deterministic graph reachability analysis",
                data={"node_count": len(build_graph(scenario).nodes)},
            ),
        )
    }


def _vehicle_facility_agent(state: PlanningState) -> PlanningState:
    trace = _append_trace(
        state,
        AgentTraceStep(
            agent="vehicle_facility",
            message="planned vehicle routes with compatible facilities",
        ),
    )
    result = plan_routes(
        state["scenario"],
        seed=state.get("seed"),
        threshold=state.get("threshold", 70),
        eligible=state.get("eligible") or [],
        trace=trace,
    )
    return {"trace": trace, "result": result}
