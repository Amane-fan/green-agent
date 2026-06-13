## 1. Project Setup

- [x] 1.1 Initialize Python uv backend project structure with FastAPI application entrypoint
- [x] 1.2 Add backend dependencies for FastAPI, LangGraph, Pydantic, NetworkX, NumPy, SQLite access, and testing
- [x] 1.3 Initialize React + Vite frontend project structure
- [x] 1.4 Add frontend dependencies for React Leaflet, Leaflet, API requests, and frontend testing
- [x] 1.5 Add development scripts for running backend, frontend, and tests locally

## 2. Shared Domain Model

- [x] 2.1 Define backend Pydantic models for scenarios, nodes, edges, bins, vehicles, facilities, fill trends, and route results
- [x] 2.2 Define garbage category constants and validation rules shared by scenario generation and planning
- [x] 2.3 Define frontend TypeScript types matching backend scenario and planning payloads
- [x] 2.4 Add serialization tests for scenario payloads and planning result payloads

## 3. Map Scenario Management

- [x] 3.1 Implement backend scenario storage for the active scenario context
- [x] 3.2 Implement graph validation for connected undirected graphs with positive edge weights
- [x] 3.3 Implement custom scenario create, update, and load API endpoints
- [x] 3.4 Implement seeded random scenario generation with 30 bins, 5 vehicles, and 3 facilities by default
- [x] 3.5 Ensure random scenarios cover every generated garbage category with compatible vehicles and facilities
- [x] 3.6 Add tests for random scenario reproducibility, graph connectivity, edge weights, and category coverage

## 4. Fill Simulation and Knowledge Pool

- [x] 4.1 Implement fill trend profiles and time advancement logic with 0 to 100 fill-rate bounds
- [x] 4.2 Implement collection threshold and prediction-horizon eligibility logic
- [x] 4.3 Implement collection result application that resets collected bins and records events
- [x] 4.4 Implement SQLite-backed knowledge sharing pool for fill history, predictions, and scenario isolation
- [x] 4.5 Add APIs for advancing simulation time, retrieving current state, and resetting scenario history
- [x] 4.6 Add tests for fill growth differences, eligibility, prediction storage, history storage, and scenario isolation

## 5. Route Planning Core

- [x] 5.1 Implement shortest path matrix calculation over the scenario graph
- [x] 5.2 Implement reachability analysis for vehicle-to-bin and bin-to-facility access under category constraints
- [x] 5.3 Implement capacity-aware task filtering and unassigned-task reason reporting
- [x] 5.4 Implement genetic algorithm encoding for vehicle assignment and per-vehicle stop ordering
- [x] 5.5 Implement objective scoring for total distance and high-fill-bin visit urgency
- [x] 5.6 Implement route result expansion into ordered stops, graph paths, distance, fuel, emissions, and warnings
- [x] 5.7 Add tests for category constraints, unreachable bins, capacity limits, objective ranking, and result schema

## 6. LangGraph Orchestration

- [x] 6.1 Define LangGraph planning state passed between agents
- [x] 6.2 Implement monitoring agent for current and predicted fill urgency
- [x] 6.3 Implement knowledge pool agent for retrieving scenario, history, and prediction data
- [x] 6.4 Implement task orchestrator agent for grouping eligible bins by garbage category
- [x] 6.5 Implement reachability analysis agent using deterministic graph tools
- [x] 6.6 Implement vehicle and facility agents that call the deterministic planner and validate destinations
- [x] 6.7 Include workflow trace output in planning responses
- [x] 6.8 Add workflow tests for successful planning, validation failure, and deterministic repeatability

## 7. Backend API Integration

- [x] 7.1 Add planning request API that runs graph validation, LangGraph orchestration, and route planning
- [x] 7.2 Add API response handling for validation errors, unreachable bins, capacity issues, and successful plans
- [x] 7.3 Add backend integration tests covering random scenario generation through route planning
- [x] 7.4 Add API documentation or examples for scenario, simulation, and planning endpoints

## 8. Frontend Scenario Editor

- [x] 8.1 Build React Leaflet map shell with base map, scenario layers, and layout panels
- [x] 8.2 Render garbage bins, vehicles, facilities, and graph edges from scenario payloads
- [x] 8.3 Implement custom node and edge creation UI with editable edge weights and node attributes
- [x] 8.4 Implement random scenario generation UI with seed input and default counts
- [x] 8.5 Display graph validation status and block planning when the graph is invalid
- [x] 8.6 Add frontend tests for scenario rendering and random generation interactions

## 9. Frontend Simulation and Planning UI

- [x] 9.1 Implement time simulation controls that call the backend and refresh bin fill-rate styling
- [x] 9.2 Encode bin category and fill-rate severity in marker styling
- [x] 9.3 Implement planning button and loading/error states
- [x] 9.4 Render each vehicle route with a distinct color on the map
- [x] 9.5 Display route stop order for selected vehicles and routes
- [x] 9.6 Display aggregate and per-vehicle metrics for distance, fuel, carbon emissions, assigned tasks, and unassigned tasks
- [x] 9.7 Add frontend tests for simulation updates, planning responses, route colors, and metrics rendering

## 10. End-to-End Verification

- [x] 10.1 Add an end-to-end demo scenario test from seeded random graph generation to displayed route plan
- [x] 10.2 Verify manual custom graph creation, validation failure, validation success, and planning behavior
- [x] 10.3 Verify category-specific collection constraints across bins, vehicles, and facilities
- [x] 10.4 Verify repeated runs with the same seed produce reproducible scenarios and deterministic workflow outputs
- [x] 10.5 Document local run instructions and demo workflow for the SE2026-12 presentation
