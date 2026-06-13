from app.models import GarbageCategory
from app.planning import plan_routes, score_route_order
from app.scenario import generate_random_scenario


def test_planner_respects_category_constraints_and_returns_metrics():
    scenario = generate_random_scenario(seed=4)
    for node in scenario.bin_nodes:
        node.fill_rate = 80

    result = plan_routes(scenario, seed=99, threshold=70)

    assert result.routes
    assert result.total_distance > 0
    assert result.estimated_fuel > 0
    assert result.estimated_carbon > 0
    for route in result.routes:
        vehicle = scenario.get_vehicle(route.vehicle_id)
        facility = scenario.get_facility(route.facility_id)
        for stop in route.stops:
            if stop.node_type == "bin":
                bin_node = scenario.get_node(stop.node_id)
                assert bin_node.waste_type == vehicle.supported_waste_type
                assert bin_node.waste_type in facility.accepted_waste_types


def test_planner_reports_unreachable_bin():
    scenario = generate_random_scenario(seed=5)
    target = scenario.bin_nodes[0]
    target.fill_rate = 95
    scenario.edges = [edge for edge in scenario.edges if target.id not in {edge.source, edge.target}]

    result = plan_routes(scenario, seed=1, threshold=70)

    assert any(task.bin_id == target.id and task.reason == "unreachable" for task in result.unassigned_tasks)


def test_planner_reports_capacity_limit():
    scenario = generate_random_scenario(seed=6)
    category = GarbageCategory.KITCHEN
    for node in scenario.bin_nodes:
        node.waste_type = category
        node.fill_rate = 100
        node.capacity = 100
    for vehicle in scenario.vehicles:
        vehicle.supported_waste_type = category
        vehicle.capacity = 50
    for facility in scenario.facilities:
        facility.accepted_waste_types = [category]

    result = plan_routes(scenario, seed=1, threshold=70)

    assert result.unassigned_tasks
    assert all(task.reason == "capacity" for task in result.unassigned_tasks)


def test_high_fill_bins_are_scored_better_when_visited_earlier():
    high_first = score_route_order([95, 70, 50], distance=100)
    high_last = score_route_order([50, 70, 95], distance=100)

    assert high_first < high_last

