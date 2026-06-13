from __future__ import annotations

from app.knowledge import KnowledgePool
from app.models import CollectionEligibility, NodeType, PredictionRecord, Scenario


def advance_time(scenario: Scenario, *, steps: int = 1) -> Scenario:
    for bin_node in scenario.bin_nodes:
        if bin_node.fill_rate is None or bin_node.fill_trend is None:
            continue
        rate = bin_node.fill_trend.rate_per_step
        increment = rate * steps
        bin_node.fill_rate = min(100, round(bin_node.fill_rate + increment, 2))
    scenario.current_time += steps
    return scenario


def compute_predictions(scenario: Scenario, *, horizon: int = 3) -> list[PredictionRecord]:
    predictions: list[PredictionRecord] = []
    for bin_node in scenario.bin_nodes:
        if bin_node.fill_rate is None or bin_node.fill_trend is None:
            continue
        for step in range(1, horizon + 1):
            predicted = advance_rate(bin_node.fill_rate, bin_node.fill_trend.rate_per_step, step)
            predictions.append(
                PredictionRecord(
                    bin_id=bin_node.id,
                    future_time=scenario.current_time + step,
                    predicted_fill_rate=predicted,
                )
            )
    return predictions


def advance_rate(fill_rate: float, rate_per_step: float, steps: int) -> float:
    return min(100, round(fill_rate + rate_per_step * steps, 2))


def identify_collection_eligible_bins(
    scenario: Scenario,
    *,
    threshold: float = 70,
    predictions: list[PredictionRecord] | None = None,
    horizon: int = 3,
) -> list[CollectionEligibility]:
    predictions = predictions or compute_predictions(scenario, horizon=horizon)
    prediction_by_bin: dict[str, float] = {}
    for prediction in predictions:
        prediction_by_bin[prediction.bin_id] = max(
            prediction_by_bin.get(prediction.bin_id, 0),
            prediction.predicted_fill_rate,
        )

    eligible: list[CollectionEligibility] = []
    for bin_node in scenario.bin_nodes:
        fill_rate = bin_node.fill_rate or 0
        predicted = prediction_by_bin.get(bin_node.id)
        if fill_rate >= threshold:
            eligible.append(
                CollectionEligibility(
                    bin_id=bin_node.id,
                    reason="current_threshold",
                    fill_rate=fill_rate,
                    predicted_fill_rate=predicted,
                    urgency=fill_rate,
                )
            )
        elif predicted is not None and predicted >= threshold:
            eligible.append(
                CollectionEligibility(
                    bin_id=bin_node.id,
                    reason="predicted_threshold",
                    fill_rate=fill_rate,
                    predicted_fill_rate=predicted,
                    urgency=predicted,
                )
            )
    return eligible


def apply_collection_result(
    scenario: Scenario,
    *,
    collected_bin_ids: list[str],
    pool: KnowledgePool | None = None,
) -> Scenario:
    collected = set(collected_bin_ids)
    for node in scenario.nodes:
        if node.type == NodeType.BIN and node.id in collected:
            node.fill_rate = 5
            if pool is not None:
                pool.record_event(
                    scenario.id,
                    node.id,
                    event_type="collection",
                    payload={"fill_rate": node.fill_rate},
                )
    return scenario
