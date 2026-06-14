from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class GarbageCategory(str, Enum):
    KITCHEN = "kitchen"
    RECYCLABLE = "recyclable"
    HAZARDOUS = "hazardous"
    OTHER = "other"


ALL_GARBAGE_CATEGORIES = tuple(GarbageCategory)


class NodeType(str, Enum):
    BIN = "bin"
    VEHICLE = "vehicle"
    FACILITY = "facility"


class FillTrend(BaseModel):
    kind: Literal["linear", "accelerating", "slow"] = "linear"
    rate_per_step: float = Field(default=1.0, ge=0)


class ScenarioNode(BaseModel):
    id: str
    type: NodeType
    lat: float
    lng: float
    waste_type: GarbageCategory | None = None
    fill_rate: float | None = Field(default=None, ge=0, le=100)
    capacity: float | None = Field(default=None, gt=0)
    fill_trend: FillTrend | None = None

    @field_validator("waste_type")
    @classmethod
    def require_waste_type_for_bins(
        cls, value: GarbageCategory | None, info: Any
    ) -> GarbageCategory | None:
        return value


class Edge(BaseModel):
    source: str
    target: str
    weight: float = Field(gt=0)


class Vehicle(BaseModel):
    id: str
    node_id: str
    supported_waste_type: GarbageCategory
    capacity: float = Field(gt=0)
    fuel_per_km: float = Field(default=0.22, gt=0)
    color: str


class ProcessingFacility(BaseModel):
    id: str
    node_id: str
    accepted_waste_types: list[GarbageCategory]
    capacity: float = Field(gt=0)


class GraphValidation(BaseModel):
    is_valid: bool = False
    disconnected_nodes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class Scenario(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    id: str
    name: str
    nodes: list[ScenarioNode] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)
    vehicles: list[Vehicle] = Field(default_factory=list)
    facilities: list[ProcessingFacility] = Field(default_factory=list)
    current_time: int = 0
    validation: GraphValidation = Field(default_factory=GraphValidation)

    @property
    def bin_nodes(self) -> list[ScenarioNode]:
        return [node for node in self.nodes if node.type == NodeType.BIN]

    @property
    def vehicle_nodes(self) -> list[ScenarioNode]:
        return [node for node in self.nodes if node.type == NodeType.VEHICLE]

    @property
    def facility_nodes(self) -> list[ScenarioNode]:
        return [node for node in self.nodes if node.type == NodeType.FACILITY]

    def get_node(self, node_id: str) -> ScenarioNode:
        for node in self.nodes:
            if node.id == node_id:
                return node
        raise KeyError(f"Unknown node id: {node_id}")

    def get_vehicle(self, vehicle_id: str) -> Vehicle:
        for vehicle in self.vehicles:
            if vehicle.id == vehicle_id:
                return vehicle
        raise KeyError(f"Unknown vehicle id: {vehicle_id}")

    def get_facility(self, facility_id: str) -> ProcessingFacility:
        for facility in self.facilities:
            if facility.id == facility_id:
                return facility
        raise KeyError(f"Unknown facility id: {facility_id}")


class CollectionEligibility(BaseModel):
    bin_id: str
    reason: Literal["current_threshold", "predicted_threshold"]
    fill_rate: float
    predicted_fill_rate: float | None = None
    urgency: float


class PredictionRecord(BaseModel):
    bin_id: str
    future_time: int
    predicted_fill_rate: float


class RouteStop(BaseModel):
    node_id: str
    node_type: Literal["bin", "facility"]
    order: int
    fill_rate: float | None = None


class VehicleRoute(BaseModel):
    vehicle_id: str
    color: str
    facility_id: str
    stops: list[RouteStop]
    path_node_ids: list[str]
    distance: float
    estimated_fuel: float
    estimated_carbon: float


class UnassignedTask(BaseModel):
    bin_id: str
    reason: Literal["unreachable", "capacity", "category", "not_eligible"]
    message: str


class AgentTraceStep(BaseModel):
    agent: str
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class PlanningResult(BaseModel):
    record_id: int | None = None
    routes: list[VehicleRoute] = Field(default_factory=list)
    unassigned_tasks: list[UnassignedTask] = Field(default_factory=list)
    total_distance: float = 0
    estimated_fuel: float = 0
    estimated_carbon: float = 0
    warnings: list[str] = Field(default_factory=list)
    trace: list[AgentTraceStep] = Field(default_factory=list)


class ScenarioGenerateRequest(BaseModel):
    seed: int | None = None
    bin_count: int = 30
    vehicle_count: int = 5
    facility_count: int = 3


class TimeAdvanceRequest(BaseModel):
    steps: int = Field(default=1, ge=1)


class PlanningRequest(BaseModel):
    seed: int | None = None
    threshold: float = Field(default=70, ge=0, le=100)


class PlanningRecordRenameRequest(BaseModel):
    title: str = Field(max_length=120)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("Planning record title cannot be blank")
        return title


class PlanningRecordSummary(BaseModel):
    id: int
    title: str
    scenario_id: str
    scenario_name: str
    simulation_time: int
    seed: int | None = None
    threshold: float
    route_count: int
    total_distance: float
    estimated_fuel: float
    estimated_carbon: float
    created_at: str


class PlanningRecordDetail(BaseModel):
    summary: PlanningRecordSummary
    scenario: Scenario
    plan: PlanningResult


class PlanningRecordRestoreResponse(BaseModel):
    record: PlanningRecordSummary
    scenario: Scenario
    plan: PlanningResult
