# Collection Route Planning Specification

## Purpose

Define how the system plans category-compatible, reachable, capacity-aware waste collection routes and returns structured optimization results.

## Requirements

### Requirement: Category-constrained collection
The system MUST only assign a garbage bin to a vehicle that supports the bin's garbage category and to a processing facility that accepts the bin's garbage category.

#### Scenario: Compatible assignment
- **WHEN** a bin is eligible for collection and a vehicle supports that bin's category
- **THEN** the planner may assign the bin to that vehicle only if the selected destination facility accepts the same category

#### Scenario: Incompatible vehicle rejected
- **WHEN** a vehicle does not support a bin's garbage category
- **THEN** the planner does not assign that bin to that vehicle

### Requirement: Reachability-aware planning
The system SHALL use graph shortest paths and reachability results when constructing vehicle routes.

#### Scenario: Use shortest path between route stops
- **WHEN** the planner evaluates a vehicle route between two route stops
- **THEN** it uses the shortest available graph path distance between those stops as the route segment cost

#### Scenario: Exclude unreachable task
- **WHEN** a bin is unreachable from all compatible vehicles or cannot reach a compatible facility
- **THEN** the planner excludes that bin from feasible routes and reports it as unassigned with an unreachable reason

### Requirement: Urgency and distance objective
The system SHALL optimize routes using an objective that prioritizes short total distance and earlier visits to higher fill-rate bins.

#### Scenario: High-fill bin priority
- **WHEN** two feasible routes have similar total distance but one route visits higher fill-rate bins earlier
- **THEN** the planner ranks the route with earlier high-fill visits better

#### Scenario: Excessive distance penalized
- **WHEN** a route visits urgent bins early but significantly increases total route distance
- **THEN** the planner accounts for the extra distance in the objective score

### Requirement: Vehicle capacity constraints
The system MUST prevent a vehicle route from collecting more garbage volume than the vehicle capacity permits.

#### Scenario: Capacity respected
- **WHEN** the planner assigns bins to a vehicle
- **THEN** the total estimated collection volume for that vehicle route does not exceed the vehicle capacity

#### Scenario: Insufficient capacity reported
- **WHEN** eligible bins exceed available compatible vehicle capacity
- **THEN** the planner returns feasible assignments and reports remaining bins as unassigned with a capacity reason

### Requirement: Genetic algorithm default optimizer
The system SHALL provide a genetic algorithm optimizer as the default route planning strategy.

#### Scenario: Run default optimizer
- **WHEN** the user requests route planning without choosing an algorithm
- **THEN** the system uses the genetic algorithm optimizer to assign bins to vehicles and order each vehicle's stops

### Requirement: Planning result schema
The system SHALL return structured planning results containing per-vehicle routes, ordered stops, expanded graph paths, total distance, estimated fuel use, estimated carbon emissions, unassigned tasks, and an API-created planning record identifier when the result is persisted.

#### Scenario: Successful planning result
- **WHEN** at least one feasible route is produced
- **THEN** the response includes one route record per used vehicle and aggregate metrics for the full plan

#### Scenario: Successful API planning result creates record id
- **WHEN** 用户通过 `POST /api/planning/routes` 成功执行路线规划
- **THEN** 响应包含本次持久化规划记录的 `record_id`

#### Scenario: Algorithm result can remain storage-independent
- **WHEN** 后端在不经过 API 持久化流程的测试或内部逻辑中直接运行规划算法
- **THEN** 规划结果仍包含路线、路径和指标，且不要求必须存在 `record_id`
