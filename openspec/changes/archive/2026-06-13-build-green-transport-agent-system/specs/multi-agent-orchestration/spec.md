## ADDED Requirements

### Requirement: LangGraph workflow orchestration
The system SHALL use LangGraph to orchestrate the route planning workflow across monitoring, knowledge, task orchestration, reachability, vehicle, and facility agents.

#### Scenario: Run planning workflow
- **WHEN** the user requests route planning
- **THEN** the LangGraph workflow processes shared state through the configured agents and returns a planning result or structured validation failure

### Requirement: Monitoring agent updates bin state
The monitoring agent SHALL read current simulation data, update bin fill status, and identify bins that require attention.

#### Scenario: Monitoring agent finds urgent bins
- **WHEN** bins have high current or predicted fill rates
- **THEN** the monitoring agent includes those bins in the workflow state with urgency metadata

### Requirement: Task orchestrator assigns candidate tasks
The task orchestrator agent SHALL group eligible collection tasks by garbage category and prepare candidate assignments for compatible vehicles.

#### Scenario: Group tasks by garbage category
- **WHEN** eligible bins include multiple garbage categories
- **THEN** the task orchestrator groups them by category and excludes vehicles that do not support that category

### Requirement: Reachability agent analyzes graph access
The reachability analysis agent SHALL verify whether compatible vehicles can reach eligible bins and whether those bins can reach compatible facilities.

#### Scenario: Unreachable bin detected
- **WHEN** an eligible bin cannot be reached by any compatible vehicle or cannot reach any compatible facility
- **THEN** the reachability agent reports the bin as unreachable with the failing reason

### Requirement: Deterministic tools for critical computation
The system MUST execute graph validation, shortest path calculation, fill simulation, and route optimization through deterministic backend functions rather than LLM-generated decisions.

#### Scenario: Repeat workflow with same state
- **WHEN** the same scenario, seed, simulation state, and planning parameters are submitted twice
- **THEN** the system produces reproducible validation, reachability, and optimization outputs

### Requirement: Workflow traceability
The system SHALL expose a concise trace of agent outputs for debugging and demonstration.

#### Scenario: Planning result includes trace
- **WHEN** a planning workflow completes
- **THEN** the result includes which agents ran, their major decisions, and any warnings or validation failures
