import json
import sqlite3

import pytest

from app.knowledge import KnowledgePool
from app.models import PlanningResult
from app.planning import plan_routes
from app.scenario import generate_random_scenario
from app.simulation import (
    advance_time,
    apply_collection_result,
    compute_predictions,
    identify_collection_eligible_bins,
)


def test_time_advancement_updates_bins_differently_and_caps_fill_rates():
    scenario = generate_random_scenario(seed=1)
    scenario.bin_nodes[0].fill_rate = 99
    scenario.bin_nodes[0].fill_trend.rate_per_step = 5
    scenario.bin_nodes[1].fill_rate = 10
    scenario.bin_nodes[1].fill_trend.rate_per_step = 1

    updated = advance_time(scenario, steps=2)

    assert updated.current_time == 2
    assert updated.bin_nodes[0].fill_rate == 100
    assert updated.bin_nodes[1].fill_rate == 12


def test_collection_eligibility_uses_current_and_predicted_fill_rate():
    scenario = generate_random_scenario(seed=2)
    scenario.bin_nodes[0].fill_rate = 71
    scenario.bin_nodes[1].fill_rate = 65
    scenario.bin_nodes[1].fill_trend.rate_per_step = 3

    predictions = compute_predictions(scenario, horizon=2)
    eligible = identify_collection_eligible_bins(
        scenario,
        threshold=70,
        predictions=predictions,
        horizon=2,
    )

    reasons = {item.bin_id: item.reason for item in eligible}
    assert reasons[scenario.bin_nodes[0].id] == "current_threshold"
    assert reasons[scenario.bin_nodes[1].id] == "predicted_threshold"


def test_collection_reset_records_history_and_prediction_data(tmp_path):
    db_path = tmp_path / "knowledge.sqlite"
    pool = KnowledgePool(db_path)
    scenario = generate_random_scenario(seed=3)
    scenario = advance_time(scenario, steps=1)
    predictions = compute_predictions(scenario, horizon=2)

    pool.replace_active_scenario(scenario)
    pool.record_fill_history(scenario)
    pool.record_predictions(scenario.id, predictions)
    collected_id = scenario.bin_nodes[0].id
    updated = apply_collection_result(scenario, collected_bin_ids=[collected_id], pool=pool)

    assert updated.get_node(collected_id).fill_rate == 5
    assert pool.get_latest_state(scenario.id)["scenario"].id == scenario.id
    assert pool.list_history(scenario.id)
    assert pool.list_predictions(scenario.id)
    assert any(event["event_type"] == "collection" for event in pool.list_events(scenario.id))


def test_knowledge_pool_isolates_replaced_scenarios(tmp_path):
    pool = KnowledgePool(tmp_path / "knowledge.sqlite")
    first = generate_random_scenario(seed=11)
    second = generate_random_scenario(seed=12)

    pool.replace_active_scenario(first)
    pool.record_fill_history(first)
    pool.replace_active_scenario(second)

    assert pool.get_latest_state(second.id)["scenario"].id == second.id
    assert pool.list_history(second.id) == []


def test_knowledge_pool_records_lists_reads_and_restores_planning_records(tmp_path):
    pool = KnowledgePool(tmp_path / "knowledge.sqlite")
    scenario = generate_random_scenario(seed=20)
    for node in scenario.bin_nodes:
        node.fill_rate = 85
    plan = plan_routes(scenario, seed=202612, threshold=70)

    record = pool.record_planning_result(scenario, plan, seed=202612, threshold=70)

    summaries = pool.list_planning_records()
    detail = pool.get_planning_record(record.summary.id)
    restored = pool.restore_planning_record(record.summary.id)

    assert summaries[0].id == record.summary.id
    assert summaries[0].title
    assert scenario.name in summaries[0].title
    assert summaries[0].scenario_name == scenario.name
    assert summaries[0].route_count == len(plan.routes)
    assert detail.summary.title == summaries[0].title
    assert detail.scenario.model_dump(mode="json") == scenario.model_dump(mode="json")
    assert detail.plan.record_id == record.summary.id
    assert restored.record.title == summaries[0].title
    assert restored.scenario.id == scenario.id
    assert pool.get_active_scenario().id == scenario.id


def test_knowledge_pool_renames_planning_record_without_changing_snapshot(tmp_path):
    pool = KnowledgePool(tmp_path / "knowledge.sqlite")
    scenario = generate_random_scenario(seed=22)
    for node in scenario.bin_nodes:
        node.fill_rate = 90
    plan = plan_routes(scenario, seed=2, threshold=70)
    record = pool.record_planning_result(scenario, plan, seed=2, threshold=70)

    renamed = pool.rename_planning_record(record.summary.id, "  东区夜间方案  ")
    detail = pool.get_planning_record(record.summary.id)

    assert renamed.title == "东区夜间方案"
    assert detail.summary.title == "东区夜间方案"
    assert detail.scenario.model_dump(mode="json") == scenario.model_dump(mode="json")
    assert detail.plan.record_id == record.summary.id


def test_knowledge_pool_rejects_invalid_planning_record_rename(tmp_path):
    pool = KnowledgePool(tmp_path / "knowledge.sqlite")
    scenario = generate_random_scenario(seed=23)
    for node in scenario.bin_nodes:
        node.fill_rate = 90
    plan = plan_routes(scenario, seed=3, threshold=70)
    record = pool.record_planning_result(scenario, plan, seed=3, threshold=70)

    with pytest.raises(ValueError):
        pool.rename_planning_record(record.summary.id, "   ")

    with pytest.raises(KeyError):
        pool.rename_planning_record(record.summary.id + 1000, "不存在记录")


def test_knowledge_pool_backfills_title_for_legacy_planning_records(tmp_path):
    db_path = tmp_path / "legacy.sqlite"
    scenario = generate_random_scenario(seed=24)
    plan = PlanningResult(record_id=1, total_distance=1.5, estimated_fuel=0.3, estimated_carbon=0.693)
    scenario_payload = json.dumps(scenario.model_dump(mode="json"), ensure_ascii=False)
    plan_payload = json.dumps(plan.model_dump(mode="json"), ensure_ascii=False)

    connection = sqlite3.connect(db_path)
    try:
        connection.executescript(
            """
            CREATE TABLE planning_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scenario_id TEXT NOT NULL,
                scenario_name TEXT NOT NULL,
                simulation_time INTEGER NOT NULL,
                seed INTEGER,
                threshold_value REAL NOT NULL,
                route_count INTEGER NOT NULL,
                total_distance REAL NOT NULL,
                estimated_fuel REAL NOT NULL,
                estimated_carbon REAL NOT NULL,
                scenario_snapshot TEXT NOT NULL,
                planning_result TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        connection.execute(
            """
            INSERT INTO planning_records
                (
                    scenario_id,
                    scenario_name,
                    simulation_time,
                    seed,
                    threshold_value,
                    route_count,
                    total_distance,
                    estimated_fuel,
                    estimated_carbon,
                    scenario_snapshot,
                    planning_result,
                    created_at
                )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scenario.id,
                scenario.name,
                scenario.current_time,
                24,
                70,
                0,
                plan.total_distance,
                plan.estimated_fuel,
                plan.estimated_carbon,
                scenario_payload,
                plan_payload,
                "2026-06-14T00:00:00Z",
            ),
        )
        connection.commit()
    finally:
        connection.close()

    pool = KnowledgePool(db_path)

    summary = pool.list_planning_records()[0]
    assert summary.title
    assert scenario.name in summary.title
    assert pool.rename_planning_record(summary.id, "兼容旧记录").title == "兼容旧记录"


def test_knowledge_pool_preserves_planning_records_when_resetting_scenario(tmp_path):
    pool = KnowledgePool(tmp_path / "knowledge.sqlite")
    scenario = generate_random_scenario(seed=21)
    for node in scenario.bin_nodes:
        node.fill_rate = 90
    plan = plan_routes(scenario, seed=1, threshold=70)
    record = pool.record_planning_result(scenario, plan, seed=1, threshold=70)

    pool.reset()

    assert pool.get_active_scenario() is None
    assert pool.get_planning_record(record.summary.id).scenario.id == scenario.id
    assert [summary.id for summary in pool.list_planning_records()] == [record.summary.id]
