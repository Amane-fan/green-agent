from app.knowledge import KnowledgePool
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

