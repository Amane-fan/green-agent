# Map Scenario Management Specification

## Purpose

Define map-based scenario creation, graph validation, random generation, category coverage, and scenario serialization.

## Requirements

### Requirement: Custom map scenario editing
The system SHALL allow users to create and edit a map scenario with garbage bins, collection vehicles, processing facilities, and undirected weighted edges on a React Leaflet map, including choosing custom node coordinates by clicking the map.

#### Scenario: Create custom map elements
- **WHEN** the user selects a garbage bin, vehicle, or processing facility to add and then clicks a map location
- **THEN** the system stores the new node with a stable id, selected type, clicked coordinates, and type-specific attributes

#### Scenario: Edit existing edge weight
- **WHEN** the user changes the weight of an existing edge
- **THEN** the system updates the graph model and uses the new weight for validation and route planning

#### Scenario: Pending node placement
- **WHEN** the user selects a custom node type before clicking the map
- **THEN** the frontend indicates that the next map click will place that node type

#### Scenario: Complete node placement
- **WHEN** the user clicks the map while a custom node type is pending placement
- **THEN** the frontend creates the node at the clicked latitude and longitude and clears the pending placement state

### Requirement: Graph validity constraints
The system MUST validate that a scenario graph is undirected, connected, and contains only positive edge weights before route planning.

#### Scenario: Connected graph passes validation
- **WHEN** every node can reach every other node through undirected edges and all edge weights are positive
- **THEN** the system marks the graph as valid for planning

#### Scenario: Disconnected graph fails validation
- **WHEN** at least one node is not reachable from the rest of the graph
- **THEN** the system reports the disconnected nodes and prevents route planning

### Requirement: Random scenario generation
The system SHALL provide a random scenario generator that creates 30 garbage bins, 5 collection vehicles, and 3 processing facilities by default.

#### Scenario: Generate default random scenario
- **WHEN** the user clicks the random generation action without custom counts
- **THEN** the system creates exactly 30 garbage bin nodes, 5 vehicle nodes, 3 facility nodes, and a connected undirected weighted graph

#### Scenario: Random generation uses seed
- **WHEN** the user generates a scenario with the same seed and default counts
- **THEN** the system produces the same nodes, edges, garbage categories, vehicle capabilities, facility capabilities, and initial fill rates

### Requirement: Random scenario category coverage
The system MUST ensure each garbage category appearing in a random scenario has at least one compatible vehicle and at least one compatible processing facility.

#### Scenario: Generated categories are serviceable
- **WHEN** the random generator assigns garbage categories to bins
- **THEN** every assigned category is covered by at least one vehicle `supported_waste_type` and at least one facility `accepted_waste_types` entry

### Requirement: Scenario serialization
The system SHALL expose scenarios through a structured API payload that can be rendered by the frontend and processed by backend planning modules.

#### Scenario: Load scenario payload
- **WHEN** the frontend requests the current scenario
- **THEN** the backend returns nodes, edges, vehicles, facilities, bins, current simulation time, and validation status in a consistent schema
