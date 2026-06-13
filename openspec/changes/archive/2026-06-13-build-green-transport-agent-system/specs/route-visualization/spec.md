## ADDED Requirements

### Requirement: Map element rendering
The frontend SHALL render garbage bins, collection vehicles, processing facilities, and graph edges on the React Leaflet map using visually distinguishable markers and lines.

#### Scenario: Render scenario
- **WHEN** the frontend loads a scenario payload
- **THEN** the map displays all nodes at their coordinates and all graph edges as map polylines with visible weights or selectable edge details

### Requirement: Fill-rate visual encoding
The frontend SHALL visually encode garbage bin fill rates and garbage categories.

#### Scenario: Render bin status
- **WHEN** a bin has a category and current fill rate
- **THEN** the map marker conveys the category and the marker styling conveys the fill-rate severity

### Requirement: Route color assignment
The frontend SHALL render each planned vehicle route with a distinct color.

#### Scenario: Display multiple vehicle routes
- **WHEN** the planning result contains routes for multiple vehicles
- **THEN** the map displays each route in a different color and associates that color with the corresponding vehicle

### Requirement: Route order visibility
The frontend SHALL show the ordered collection sequence for each vehicle route.

#### Scenario: Inspect route order
- **WHEN** the user selects a planned route or vehicle
- **THEN** the frontend shows the ordered stops, including garbage bins and destination processing facility

### Requirement: Planning metrics panel
The frontend SHALL display total route distance, estimated fuel use, estimated carbon emissions, assigned tasks, unassigned tasks, and validation warnings after planning.

#### Scenario: Planning metrics displayed
- **WHEN** a planning result is returned
- **THEN** the metrics panel updates with aggregate metrics, per-vehicle metrics, and any unassigned or unreachable bin reasons

### Requirement: Time simulation controls
The frontend SHALL provide controls to advance simulation time and refresh visible fill-rate state.

#### Scenario: Advance time from UI
- **WHEN** the user advances simulation time from the frontend
- **THEN** the map updates bin fill-rate styling and the displayed simulation time after the backend returns the new state
