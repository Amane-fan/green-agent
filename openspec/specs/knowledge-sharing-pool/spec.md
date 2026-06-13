# Knowledge Sharing Pool Specification

## Purpose

Define shared scenario, historical fill, and prediction data storage used by planning and orchestration modules.

## Requirements

### Requirement: Historical fill data storage
The system SHALL store historical fill-rate records for garbage bins, including bin id, simulation time, fill rate, and optional collection event metadata.

#### Scenario: Store fill history after time advance
- **WHEN** simulation time advances and bin fill rates change
- **THEN** the system records the updated fill rate for each bin in the knowledge sharing pool

### Requirement: Prediction data storage
The system SHALL store predicted fill-rate records for garbage bins so planning agents can use near-term urgency information.

#### Scenario: Store prediction horizon
- **WHEN** the system computes fill predictions for a scenario
- **THEN** the knowledge sharing pool stores predicted fill rates keyed by bin id and future simulation time

### Requirement: Planning state retrieval
The system SHALL provide the latest scenario state, historical fill data, and prediction data to route planning and orchestration modules.

#### Scenario: Planner requests shared state
- **WHEN** the route planning workflow starts
- **THEN** the knowledge sharing pool returns current bin states, relevant history, predictions, vehicles, facilities, and graph data

### Requirement: Scenario reset isolation
The system MUST isolate records between different generated or custom scenarios.

#### Scenario: Replace active scenario
- **WHEN** the user creates a new random scenario or clears the custom scenario
- **THEN** the system starts a new scenario context and does not mix previous scenario history into the new planning workflow
