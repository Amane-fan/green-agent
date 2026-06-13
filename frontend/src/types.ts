export type GarbageCategory = 'kitchen' | 'recyclable' | 'hazardous' | 'other';
export type NodeType = 'bin' | 'vehicle' | 'facility';

export interface FillTrend {
  kind: 'linear' | 'accelerating' | 'slow';
  rate_per_step: number;
}

export interface ScenarioNode {
  id: string;
  type: NodeType;
  lat: number;
  lng: number;
  waste_type?: GarbageCategory | null;
  fill_rate?: number | null;
  capacity?: number | null;
  fill_trend?: FillTrend | null;
}

export interface Edge {
  source: string;
  target: string;
  weight: number;
}

export interface Vehicle {
  id: string;
  node_id: string;
  supported_waste_type: GarbageCategory;
  capacity: number;
  fuel_per_km: number;
  color: string;
}

export interface ProcessingFacility {
  id: string;
  node_id: string;
  accepted_waste_types: GarbageCategory[];
  capacity: number;
}

export interface GraphValidation {
  is_valid: boolean;
  disconnected_nodes: string[];
  warnings: string[];
}

export interface Scenario {
  id: string;
  name: string;
  nodes: ScenarioNode[];
  edges: Edge[];
  vehicles: Vehicle[];
  facilities: ProcessingFacility[];
  current_time: number;
  validation: GraphValidation;
}

export interface RouteStop {
  node_id: string;
  node_type: 'bin' | 'facility';
  order: number;
  fill_rate?: number | null;
}

export interface VehicleRoute {
  vehicle_id: string;
  color: string;
  facility_id: string;
  stops: RouteStop[];
  path_node_ids: string[];
  distance: number;
  estimated_fuel: number;
  estimated_carbon: number;
}

export interface UnassignedTask {
  bin_id: string;
  reason: 'unreachable' | 'capacity' | 'category' | 'not_eligible';
  message: string;
}

export interface AgentTraceStep {
  agent: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface PlanningResult {
  routes: VehicleRoute[];
  unassigned_tasks: UnassignedTask[];
  total_distance: number;
  estimated_fuel: number;
  estimated_carbon: number;
  warnings: string[];
  trace: AgentTraceStep[];
}

