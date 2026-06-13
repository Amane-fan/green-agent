from app.graph import validate_graph
from app.scenario import generate_random_scenario


def test_seeded_random_scenario_is_reproducible_and_connected():
    first = generate_random_scenario(seed=202612)
    second = generate_random_scenario(seed=202612)

    assert first.model_dump(mode="json") == second.model_dump(mode="json")
    assert len([node for node in first.nodes if node.type == "bin"]) == 30
    assert len(first.vehicles) == 5
    assert len(first.facilities) == 3
    assert validate_graph(first).is_valid is True
    assert all(edge.weight > 0 for edge in first.edges)


def test_random_scenario_category_coverage():
    scenario = generate_random_scenario(seed=42)
    bin_categories = {node.waste_type for node in scenario.bin_nodes}
    vehicle_categories = {vehicle.supported_waste_type for vehicle in scenario.vehicles}
    facility_categories = {
        category
        for facility in scenario.facilities
        for category in facility.accepted_waste_types
    }

    assert bin_categories <= vehicle_categories
    assert bin_categories <= facility_categories


def test_graph_validation_reports_disconnected_nodes():
    scenario = generate_random_scenario(seed=9)
    scenario.edges = [edge for edge in scenario.edges if "bin-0" not in {edge.source, edge.target}]

    result = validate_graph(scenario)

    assert result.is_valid is False
    assert "bin-0" in result.disconnected_nodes

