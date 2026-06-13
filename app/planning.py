from __future__ import annotations

import random
from collections import defaultdict

import networkx as nx

from app.graph import build_graph, shortest_path, validate_graph
from app.models import (
    AgentTraceStep,
    CollectionEligibility,
    GarbageCategory,
    PlanningResult,
    RouteStop,
    Scenario,
    ScenarioNode,
    UnassignedTask,
    Vehicle,
    VehicleRoute,
)
from app.simulation import compute_predictions, identify_collection_eligible_bins

CARBON_KG_PER_LITER = 2.31


def score_route_order(fill_rates: list[float], *, distance: float) -> float:
    delay_penalty = sum(
        (index + 1) * fill_rate for index, fill_rate in enumerate(fill_rates)
    )
    return distance + delay_penalty * 0.01


def plan_routes(
    scenario: Scenario,
    *,
    seed: int | None = None,
    threshold: float = 70,
    eligible: list[CollectionEligibility] | None = None,
    trace: list[AgentTraceStep] | None = None,
) -> PlanningResult:
    rng = random.Random(seed)
    validation = validate_graph(scenario)
    if not validation.is_valid:
        return PlanningResult(
            warnings=validation.warnings,
            trace=trace or [],
            unassigned_tasks=[
                UnassignedTask(
                    bin_id=node_id,
                    reason="unreachable",
                    message="Graph is disconnected before planning",
                )
                for node_id in validation.disconnected_nodes
            ],
        )

    graph = build_graph(scenario)
    predictions = compute_predictions(scenario, horizon=3)
    eligible = eligible or identify_collection_eligible_bins(
        scenario,
        threshold=threshold,
        predictions=predictions,
    )
    eligible_ids = {item.bin_id for item in eligible}
    bins = [node for node in scenario.bin_nodes if node.id in eligible_ids]
    bins.sort(key=lambda node: (-(node.fill_rate or 0), node.id))

    unassigned: list[UnassignedTask] = []
    assignments: dict[str, list[ScenarioNode]] = defaultdict(list)
    remaining_capacity = {vehicle.id: vehicle.capacity for vehicle in scenario.vehicles}

    for bin_node in bins:
        compatible_vehicles = [
            vehicle
            for vehicle in scenario.vehicles
            if vehicle.supported_waste_type == bin_node.waste_type
        ]
        compatible_facilities = _compatible_facilities(scenario, bin_node.waste_type)
        if not compatible_vehicles or not compatible_facilities:
            unassigned.append(
                UnassignedTask(
                    bin_id=bin_node.id,
                    reason="category",
                    message="No compatible vehicle or facility",
                )
            )
            continue

        reachable_vehicles = [
            vehicle
            for vehicle in compatible_vehicles
            if _has_path(graph, vehicle.node_id, bin_node.id)
            and any(_has_path(graph, bin_node.id, facility.node_id) for facility in compatible_facilities)
        ]
        if not reachable_vehicles:
            unassigned.append(
                UnassignedTask(
                    bin_id=bin_node.id,
                    reason="unreachable",
                    message="No compatible reachable vehicle and facility path",
                )
            )
            continue

        volume = _estimated_volume(bin_node)
        candidates = [
            vehicle
            for vehicle in reachable_vehicles
            if remaining_capacity[vehicle.id] >= volume
        ]
        if not candidates:
            unassigned.append(
                UnassignedTask(
                    bin_id=bin_node.id,
                    reason="capacity",
                    message="Compatible vehicles have insufficient remaining capacity",
                )
            )
            continue

        selected = min(
            candidates,
            key=lambda vehicle: (
                len(assignments[vehicle.id]),
                _safe_distance(graph, vehicle.node_id, bin_node.id),
                rng.random(),
            ),
        )
        assignments[selected.id].append(bin_node)
        remaining_capacity[selected.id] -= volume

    routes: list[VehicleRoute] = []
    for vehicle in scenario.vehicles:
        assigned_bins = assignments.get(vehicle.id, [])
        if not assigned_bins:
            continue
        ordered_bins = _order_bins_by_genetic_algorithm(
            graph,
            vehicle,
            assigned_bins,
            rng=rng,
        )
        facility = min(
            _compatible_facilities(scenario, vehicle.supported_waste_type),
            key=lambda candidate: _safe_distance(graph, ordered_bins[-1].id, candidate.node_id),
        )
        route = _build_route(graph, scenario, vehicle, ordered_bins, facility.id)
        routes.append(route)

    total_distance = round(sum(route.distance for route in routes), 3)
    estimated_fuel = round(sum(route.estimated_fuel for route in routes), 3)
    estimated_carbon = round(estimated_fuel * CARBON_KG_PER_LITER, 3)
    return PlanningResult(
        routes=routes,
        unassigned_tasks=unassigned,
        total_distance=total_distance,
        estimated_fuel=estimated_fuel,
        estimated_carbon=estimated_carbon,
        warnings=[],
        trace=trace or [],
    )


def _compatible_facilities(scenario: Scenario, category: GarbageCategory | None):
    return [
        facility
        for facility in scenario.facilities
        if category in facility.accepted_waste_types
    ]


def _estimated_volume(bin_node: ScenarioNode) -> float:
    return round((bin_node.capacity or 0) * ((bin_node.fill_rate or 0) / 100), 3)


def _has_path(graph: nx.Graph, source: str, target: str) -> bool:
    return source in graph and target in graph and nx.has_path(graph, source, target)


def _safe_distance(graph: nx.Graph, source: str, target: str) -> float:
    try:
        distance, _ = shortest_path(graph, source, target)
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return float("inf")
    return distance


def _order_bins_by_genetic_algorithm(
    graph: nx.Graph,
    vehicle: Vehicle,
    assigned_bins: list[ScenarioNode],
    *,
    rng: random.Random,
) -> list[ScenarioNode]:
    if len(assigned_bins) <= 2:
        return _order_bins_by_greedy_distance(graph, vehicle, assigned_bins)

    population: list[list[ScenarioNode]] = [
        _order_bins_by_greedy_distance(graph, vehicle, assigned_bins)
    ]
    for _ in range(23):
        candidate = assigned_bins[:]
        rng.shuffle(candidate)
        population.append(candidate)

    for _ in range(35):
        population.sort(key=lambda order: _route_order_fitness(graph, vehicle, order))
        survivors = population[:8]
        children: list[list[ScenarioNode]] = []
        while len(children) < 16:
            left, right = rng.sample(survivors, 2)
            cut = rng.randint(1, len(left) - 1)
            prefix = left[:cut]
            child = prefix + [node for node in right if node.id not in {item.id for item in prefix}]
            if rng.random() < 0.25:
                a, b = rng.sample(range(len(child)), 2)
                child[a], child[b] = child[b], child[a]
            children.append(child)
        population = survivors + children

    return min(population, key=lambda order: _route_order_fitness(graph, vehicle, order))


def _order_bins_by_greedy_distance(
    graph: nx.Graph,
    vehicle: Vehicle,
    assigned_bins: list[ScenarioNode],
) -> list[ScenarioNode]:
    remaining = assigned_bins[:]
    ordered: list[ScenarioNode] = []
    current = vehicle.node_id
    while remaining:
        remaining.sort(
            key=lambda node: (
                _safe_distance(graph, current, node.id) - (node.fill_rate or 0) * 0.02,
                -(node.fill_rate or 0),
                node.id,
            )
        )
        next_bin = remaining.pop(0)
        ordered.append(next_bin)
        current = next_bin.id
    return ordered


def _route_order_fitness(
    graph: nx.Graph,
    vehicle: Vehicle,
    ordered_bins: list[ScenarioNode],
) -> float:
    if not ordered_bins:
        return 0
    distance = 0.0
    current = vehicle.node_id
    for bin_node in ordered_bins:
        distance += _safe_distance(graph, current, bin_node.id)
        current = bin_node.id
    fill_rates = [bin_node.fill_rate or 0 for bin_node in ordered_bins]
    return score_route_order(fill_rates, distance=distance)


def _build_route(
    graph: nx.Graph,
    scenario: Scenario,
    vehicle: Vehicle,
    ordered_bins: list[ScenarioNode],
    facility_id: str,
) -> VehicleRoute:
    facility = scenario.get_facility(facility_id)
    sequence = [vehicle.node_id, *[node.id for node in ordered_bins], facility.node_id]
    path_node_ids: list[str] = []
    distance = 0.0
    for source, target in zip(sequence, sequence[1:], strict=False):
        segment_distance, segment_path = shortest_path(graph, source, target)
        distance += segment_distance
        if path_node_ids:
            path_node_ids.extend(segment_path[1:])
        else:
            path_node_ids.extend(segment_path)

    stops = [
        RouteStop(
            node_id=bin_node.id,
            node_type="bin",
            order=index + 1,
            fill_rate=bin_node.fill_rate,
        )
        for index, bin_node in enumerate(ordered_bins)
    ]
    stops.append(
        RouteStop(
            node_id=facility.node_id,
            node_type="facility",
            order=len(stops) + 1,
        )
    )
    distance = round(distance, 3)
    estimated_fuel = round(distance * vehicle.fuel_per_km, 3)
    return VehicleRoute(
        vehicle_id=vehicle.id,
        color=vehicle.color,
        facility_id=facility.id,
        stops=stops,
        path_node_ids=path_node_ids,
        distance=distance,
        estimated_fuel=estimated_fuel,
        estimated_carbon=round(estimated_fuel * CARBON_KG_PER_LITER, 3),
    )
