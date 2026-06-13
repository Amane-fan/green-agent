from app.models import (
    Edge,
    FillTrend,
    GarbageCategory,
    NodeType,
    Scenario,
    ScenarioNode,
    Vehicle,
    ProcessingFacility,
)
from app.scenario import validate_garbage_category_coverage


def test_scenario_payload_serializes_nodes_edges_and_validation_status():
    scenario = Scenario(
        id="s1",
        name="demo",
        nodes=[
            ScenarioNode(
                id="bin-1",
                type=NodeType.BIN,
                lat=31.1,
                lng=121.1,
                waste_type=GarbageCategory.KITCHEN,
                fill_rate=75,
                capacity=10,
                fill_trend=FillTrend(kind="linear", rate_per_step=3),
            )
        ],
        edges=[Edge(source="bin-1", target="facility-1", weight=1.5)],
        vehicles=[
            Vehicle(
                id="vehicle-1",
                node_id="vehicle-node-1",
                supported_waste_type=GarbageCategory.KITCHEN,
                capacity=50,
                fuel_per_km=0.2,
                color="#16a34a",
            )
        ],
        facilities=[
            ProcessingFacility(
                id="facility-1",
                node_id="facility-node-1",
                accepted_waste_types=[GarbageCategory.KITCHEN],
                capacity=200,
            )
        ],
    )

    payload = scenario.model_dump(mode="json")

    assert payload["nodes"][0]["waste_type"] == "kitchen"
    assert payload["edges"][0]["weight"] == 1.5
    assert payload["validation"]["is_valid"] is False


def test_category_coverage_rejects_unserviceable_generated_category():
    bins = [
        ScenarioNode(
            id="hazard-bin",
            type=NodeType.BIN,
            lat=31.1,
            lng=121.1,
            waste_type=GarbageCategory.HAZARDOUS,
            fill_rate=75,
            capacity=10,
            fill_trend=FillTrend(kind="linear", rate_per_step=3),
        )
    ]
    vehicles = [
        Vehicle(
            id="vehicle-1",
            node_id="vehicle-node-1",
            supported_waste_type=GarbageCategory.KITCHEN,
            capacity=50,
            fuel_per_km=0.2,
            color="#16a34a",
        )
    ]
    facilities = [
        ProcessingFacility(
            id="facility-1",
            node_id="facility-node-1",
            accepted_waste_types=[GarbageCategory.KITCHEN],
            capacity=200,
        )
    ]

    result = validate_garbage_category_coverage(bins, vehicles, facilities)

    assert result.is_valid is False
    assert "hazardous" in result.warnings[0]

