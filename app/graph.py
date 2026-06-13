from __future__ import annotations

import math

import networkx as nx

from app.models import Edge, GraphValidation, Scenario


def coordinate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    return round(math.hypot((lat1 - lat2) * 111, (lng1 - lng2) * 111), 3)


def build_graph(scenario: Scenario) -> nx.Graph:
    graph = nx.Graph()
    for node in scenario.nodes:
        graph.add_node(node.id)
    for edge in scenario.edges:
        graph.add_edge(edge.source, edge.target, weight=edge.weight)
    return graph


def validate_graph(scenario: Scenario) -> GraphValidation:
    warnings: list[str] = []
    node_ids = {node.id for node in scenario.nodes}
    for edge in scenario.edges:
        if edge.weight <= 0:
            warnings.append(f"Edge {edge.source}-{edge.target} has non-positive weight")
        if edge.source not in node_ids or edge.target not in node_ids:
            warnings.append(f"Edge {edge.source}-{edge.target} references missing node")

    if not scenario.nodes:
        return GraphValidation(is_valid=False, warnings=["Scenario has no nodes"])

    graph = build_graph(scenario)
    if warnings:
        return GraphValidation(
            is_valid=False,
            disconnected_nodes=[],
            warnings=warnings,
        )

    if not nx.is_connected(graph):
        largest = max(nx.connected_components(graph), key=len)
        disconnected = sorted(node_id for node_id in node_ids if node_id not in largest)
        return GraphValidation(
            is_valid=False,
            disconnected_nodes=disconnected,
            warnings=["Graph is disconnected"],
        )

    return GraphValidation(is_valid=True, warnings=[])


def shortest_path(graph: nx.Graph, source: str, target: str) -> tuple[float, list[str]]:
    distance = nx.shortest_path_length(graph, source=source, target=target, weight="weight")
    path = nx.shortest_path(graph, source=source, target=target, weight="weight")
    return float(distance), list(path)

