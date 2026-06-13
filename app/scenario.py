from __future__ import annotations

import random
from dataclasses import dataclass

from app.graph import coordinate_distance, validate_graph
from app.models import (
    ALL_GARBAGE_CATEGORIES,
    Edge,
    FillTrend,
    GarbageCategory,
    GraphValidation,
    NodeType,
    ProcessingFacility,
    Scenario,
    ScenarioNode,
    Vehicle,
)


@dataclass(frozen=True)
class CoverageResult:
    is_valid: bool
    warnings: list[str]


VEHICLE_COLORS = ["#16a34a", "#2563eb", "#dc2626", "#9333ea", "#f97316"]


def validate_garbage_category_coverage(
    bins: list[ScenarioNode],
    vehicles: list[Vehicle],
    facilities: list[ProcessingFacility],
) -> CoverageResult:
    bin_categories = {bin_node.waste_type for bin_node in bins if bin_node.waste_type}
    vehicle_categories = {vehicle.supported_waste_type for vehicle in vehicles}
    facility_categories = {
        category
        for facility in facilities
        for category in facility.accepted_waste_types
    }
    warnings: list[str] = []

    for category in sorted(bin_categories, key=lambda item: item.value):
        if category not in vehicle_categories:
            warnings.append(f"{category.value} has no compatible vehicle")
        if category not in facility_categories:
            warnings.append(f"{category.value} has no compatible facility")

    return CoverageResult(is_valid=not warnings, warnings=warnings)


def generate_random_scenario(
    *,
    seed: int | None = None,
    bin_count: int = 30,
    vehicle_count: int = 5,
    facility_count: int = 3,
) -> Scenario:
    rng = random.Random(seed)
    categories = list(ALL_GARBAGE_CATEGORIES)
    base_lat = 31.23
    base_lng = 121.47
    nodes: list[ScenarioNode] = []

    for index in range(bin_count):
        category = categories[index % len(categories)]
        trend_kind = ["linear", "accelerating", "slow"][index % 3]
        nodes.append(
            ScenarioNode(
                id=f"bin-{index}",
                type=NodeType.BIN,
                lat=round(base_lat + rng.uniform(-0.045, 0.045), 6),
                lng=round(base_lng + rng.uniform(-0.055, 0.055), 6),
                waste_type=category,
                fill_rate=round(rng.uniform(35, 92), 2),
                capacity=round(rng.uniform(8, 18), 2),
                fill_trend=FillTrend(
                    kind=trend_kind,
                    rate_per_step=round(rng.uniform(0.8, 4.2), 2),
                ),
            )
        )

    vehicles: list[Vehicle] = []
    for index in range(vehicle_count):
        category = categories[index % len(categories)]
        node_id = f"vehicle-node-{index}"
        nodes.append(
            ScenarioNode(
                id=node_id,
                type=NodeType.VEHICLE,
                lat=round(base_lat + rng.uniform(-0.035, 0.035), 6),
                lng=round(base_lng + rng.uniform(-0.045, 0.045), 6),
            )
        )
        vehicles.append(
            Vehicle(
                id=f"vehicle-{index}",
                node_id=node_id,
                supported_waste_type=category,
                capacity=100,
                fuel_per_km=round(0.18 + index * 0.02, 3),
                color=VEHICLE_COLORS[index % len(VEHICLE_COLORS)],
            )
        )

    facilities: list[ProcessingFacility] = []
    facility_categories = [
        [GarbageCategory.KITCHEN, GarbageCategory.RECYCLABLE],
        [GarbageCategory.HAZARDOUS],
        [GarbageCategory.OTHER],
    ]
    for index in range(facility_count):
        accepted = facility_categories[index % len(facility_categories)]
        node_id = f"facility-node-{index}"
        nodes.append(
            ScenarioNode(
                id=node_id,
                type=NodeType.FACILITY,
                lat=round(base_lat + rng.uniform(-0.04, 0.04), 6),
                lng=round(base_lng + rng.uniform(-0.05, 0.05), 6),
            )
        )
        facilities.append(
            ProcessingFacility(
                id=f"facility-{index}",
                node_id=node_id,
                accepted_waste_types=accepted,
                capacity=500,
            )
        )

    edges = _generate_connected_edges(nodes, rng)
    scenario = Scenario(
        id=f"scenario-{seed if seed is not None else rng.randint(100000, 999999)}",
        name="随机演示场景",
        nodes=nodes,
        edges=edges,
        vehicles=vehicles,
        facilities=facilities,
    )
    coverage = validate_garbage_category_coverage(scenario.bin_nodes, vehicles, facilities)
    validation = validate_graph(scenario)
    scenario.validation = GraphValidation(
        is_valid=validation.is_valid and coverage.is_valid,
        disconnected_nodes=validation.disconnected_nodes,
        warnings=[*validation.warnings, *coverage.warnings],
    )
    return scenario


def _generate_connected_edges(nodes: list[ScenarioNode], rng: random.Random) -> list[Edge]:
    edges: dict[tuple[str, str], Edge] = {}
    connected = [nodes[0]]
    remaining = nodes[1:]

    while remaining:
        candidate = remaining.pop(0)
        nearest = min(
            connected,
            key=lambda node: coordinate_distance(
                candidate.lat, candidate.lng, node.lat, node.lng
            ),
        )
        _add_edge(edges, candidate, nearest)
        connected.append(candidate)

    for node in nodes:
        neighbors = sorted(
            (other for other in nodes if other.id != node.id),
            key=lambda other: coordinate_distance(node.lat, node.lng, other.lat, other.lng),
        )
        for neighbor in neighbors[:2]:
            if rng.random() < 0.75:
                _add_edge(edges, node, neighbor)

    return list(edges.values())


def _add_edge(
    edges: dict[tuple[str, str], Edge],
    source: ScenarioNode,
    target: ScenarioNode,
) -> None:
    key = tuple(sorted((source.id, target.id)))
    if key in edges:
        return
    edges[key] = Edge(
        source=key[0],
        target=key[1],
        weight=max(
            0.1,
            coordinate_distance(source.lat, source.lng, target.lat, target.lng),
        ),
    )

