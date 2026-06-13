## ADDED Requirements

### Requirement: Fill level state
The system SHALL track each garbage bin's fill rate as a percentage from 0 to 100 and associate each bin with a fill trend profile.

#### Scenario: Bin has fill state
- **WHEN** a garbage bin is created manually or by random generation
- **THEN** the system assigns it a current fill rate, capacity, garbage category, and fill trend profile

### Requirement: Time advancement
The system SHALL simulate time advancement and update garbage bin fill rates according to each bin's trend profile.

#### Scenario: Advance simulation time
- **WHEN** the user advances the simulation by one or more time steps
- **THEN** the system updates each bin's fill rate according to its own trend profile and caps the result between 0 and 100

#### Scenario: Different bins grow differently
- **WHEN** two bins have different trend profiles
- **THEN** advancing the same time interval can produce different fill-rate changes for those bins

### Requirement: Collection eligibility
The system SHALL identify bins that are eligible for collection based on current fill rate and near-term predicted fill rate.

#### Scenario: Bin exceeds collection threshold
- **WHEN** a bin's current fill rate is greater than or equal to the configured collection threshold
- **THEN** the system marks the bin as eligible for collection

#### Scenario: Bin predicted to exceed threshold
- **WHEN** a bin's current fill rate is below the threshold but its predicted fill rate reaches the threshold within the configured horizon
- **THEN** the system marks the bin as eligible for collection with a prediction reason

### Requirement: Fill reset after collection
The system SHALL support resetting collected bins to a low fill rate after a collection action is applied.

#### Scenario: Apply collection result
- **WHEN** the user applies a planned collection result to the simulation
- **THEN** the system resets collected bins' fill rates and records the collection event in history
