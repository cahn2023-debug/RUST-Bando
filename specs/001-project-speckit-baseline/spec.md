# Feature Specification: Project Speckit Baseline

**Feature Branch**: `[001-project-speckit-baseline]`  
**Created**: 2026-08-01  
**Status**: Draft  
**Input**: User description: "Tong hop toan bo du an va cac spec cua du an vao speckit (specify)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage Offline Engineering Projects (Priority: P1)

As a project manager or technical designer, I want to create, open, save, move, and archive a complete engineering project as a portable project package so that field and office work can continue without depending on a live server.

**Why this priority**: Portable offline project management is the core value of the application and the foundation for every map, file, task, report, and analysis workflow.

**Independent Test**: Can be tested by creating a new project package, adding representative project data, closing the application, moving the project folder, reopening it, and confirming all project content remains available.

**Acceptance Scenarios**:

1. **Given** a user has no active project, **When** they create a project package with a name and storage location, **Then** the system creates a portable project workspace and makes it the active project.
2. **Given** an existing project package has been moved to a different folder, **When** the user opens it from the new location, **Then** the project opens without losing internal links to its managed content.
3. **Given** a project contains tasks, files, map features, and metadata, **When** the user closes and reopens the project, **Then** the latest saved state is restored consistently.

---

### User Story 2 - Design And Inspect GIS Infrastructure (Priority: P1)

As a technical designer, I want to draw, edit, classify, inspect, and validate points, polylines, polygons, and infrastructure features on a map so that project assets can be designed and reviewed spatially.

**Why this priority**: GIS design is a primary workspace of the product and links engineering data to real-world location, topology, and quantities.

**Independent Test**: Can be tested by opening a project map, creating features on multiple layers, editing metadata and styling, validating geometry, and confirming the map, explorer, and property panels show the same state.

**Acceptance Scenarios**:

1. **Given** a project map is open, **When** the user draws a point, line, polyline, or polygon and assigns metadata, **Then** the feature appears on the map and can be selected from the project explorer.
2. **Given** a feature has editable properties, **When** the user updates its name, layer, visibility, style, or metadata, **Then** the map and property panels reflect the change without requiring a full project reload.
3. **Given** a project contains invalid or degraded geometry, **When** the user runs validation, **Then** the system reports actionable diagnostics and preserves valid project data.

---

### User Story 3 - Manage Fiber Network Inventory (Priority: P1)

As a telecom network designer, I want to convert GIS cable routes into fiber inventory records, manage strands, ports, splices, circuits, and diagnostics so that optical network capacity and connectivity can be planned and traced.

**Why this priority**: Fiber/polyline functionality is one of the most detailed domain modules and turns map geometry into operational network inventory.

**Independent Test**: Can be tested by drawing a cable route, materializing it as a fiber cable, assigning strand capacity, creating splice/port relationships, tracing a circuit from A to Z, and reviewing capacity and diagnostic panels.

**Acceptance Scenarios**:

1. **Given** a valid polyline route exists, **When** the user materializes it as a fiber cable, **Then** the system creates a cable record, start/end or enclosure points, and strand inventory linked to the route.
2. **Given** a fiber cable has strands and connection points, **When** the user updates strand status, splices, terminations, or patching, **Then** capacity summaries and connectivity diagnostics update to reflect the current network state.
3. **Given** a circuit has defined A and Z endpoints, **When** the user traces the circuit, **Then** the system shows the ordered path, involved strands/ports/splices, total loss where available, and any broken segment.

---

### User Story 4 - Organize Files, Tasks, Search, And Reports (Priority: P2)

As a project operator, I want to manage project files, tasks, contracts, quantities, search results, and generated reports from one workspace so that project documentation and execution status stay connected.

**Why this priority**: These workflows turn the map/design system into a project management tool rather than only a drawing surface.

**Independent Test**: Can be tested by importing files, assigning metadata, creating linked tasks, searching across project entities, and exporting a report that includes selected project/map data.

**Acceptance Scenarios**:

1. **Given** a user imports or links project documents, **When** metadata is added or extracted, **Then** the files remain searchable and associated with the active project.
2. **Given** a project has tasks and dependencies, **When** the user changes status, dates, progress, or relationships, **Then** dashboard, task views, and dependency warnings reflect the updated plan.
3. **Given** the user prepares a project report, **When** they select project data and map captures, **Then** the generated document contains the requested summary, quantities, images, and metadata.

---

### User Story 5 - Use Offline Analysis And Assistance (Priority: P2)

As a technical user working in offline or constrained environments, I want optional local analysis for OCR, object detection, metadata normalization, and project insight so that repetitive review work is faster without sending project data away by default.

**Why this priority**: Offline analysis adds value to documents, imagery, and project metadata while matching the local-first product direction.

**Independent Test**: Can be tested by running analysis on representative files/images, reviewing extracted metadata, correcting results, and confirming the project stores both generated output and user corrections.

**Acceptance Scenarios**:

1. **Given** a project file or image is selected, **When** the user runs analysis, **Then** the system produces reviewable metadata or findings without blocking normal project navigation.
2. **Given** analysis output is incorrect or incomplete, **When** the user edits or confirms the result, **Then** the corrected value is stored as the authoritative project metadata.
3. **Given** system resources are limited, **When** analysis is not in use, **Then** the application keeps heavy assistance features inactive and leaves core project workflows usable.

---

### User Story 6 - Preserve Compatibility And Operational Quality (Priority: P3)

As a maintainer or advanced user, I want old project data, large datasets, and production builds to remain reliable so that migration, performance, and deployment risks are visible and controlled.

**Why this priority**: Compatibility and hardening protect existing project data and make the product dependable, but they support the main user workflows rather than replacing them.

**Independent Test**: Can be tested by opening representative legacy project packages, running migration/integrity checks, loading large maps, and validating packaged application behavior on target machines.

**Acceptance Scenarios**:

1. **Given** a legacy project package is opened, **When** migration is required, **Then** the system protects the original data, upgrades supported content, and reports unsupported items clearly.
2. **Given** a large project contains tens of thousands of map features, **When** the user opens the project and navigates the first viewport, **Then** the application remains responsive and progressively loads project content.
3. **Given** a production build is installed on a target Windows workstation, **When** the user opens, edits, saves, and reopens a project, **Then** the workflow completes without missing command handlers or environment-specific build errors.

### Edge Cases

- Project package is moved, renamed, or opened from a path with spaces or non-English characters.
- Project package is missing referenced external files or contains stale relative paths.
- Legacy project schema is older, partially migrated, or has metadata fields not recognized by the current application.
- Large project contains more than 10,000 visible map features or very dense fiber topology.
- Geometry contains duplicate vertices, broken polylines, invalid bounds, or mismatched metadata.
- Two users or processes attempt to write to the same project package at the same time.
- Analysis features are requested on unsupported file formats, corrupted files, or low-memory machines.
- Report export is requested before all selected map captures or metadata are available.
- Search queries include Vietnamese text with accents, without accents, or mixed casing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to create, open, save, close, move, and archive portable project packages that contain project metadata and managed project data.
- **FR-002**: System MUST preserve project integrity across application restart, project relocation, and normal save/load cycles.
- **FR-003**: System MUST maintain project entities including projects, files, tasks, map layers, map features, metadata, reports, and domain-specific infrastructure records.
- **FR-004**: System MUST support relative project references so moved project folders can be reopened without breaking managed content links.
- **FR-005**: System MUST provide migration and integrity review for supported legacy project packages before modifying upgraded data.
- **FR-006**: System MUST provide a map workspace where users can view, draw, select, edit, hide/show, group, and classify GIS features.
- **FR-007**: System MUST keep map, explorer, property panels, and project summaries consistent after user edits.
- **FR-008**: System MUST validate GIS geometry and report problems such as broken polylines, duplicate coordinates, invalid bounds, and missing required metadata.
- **FR-009**: System MUST support engineering calculations and visual overlays relevant to surveillance/camera planning, including DORI-style observation zones.
- **FR-010**: System MUST allow users to convert eligible polyline routes into fiber cable inventory while preserving the original spatial route.
- **FR-011**: System MUST manage fiber cables, strands, cable points, splice enclosures, ports, terminations, patches, circuits, strand states, and loss values where provided.
- **FR-012**: System MUST trace fiber circuits between endpoints and identify each ordered hop, related route segment, connection element, and broken or incomplete link.
- **FR-013**: System MUST summarize fiber capacity by cable, status, and availability so users can distinguish available, reserved, active, damaged, and retired resources.
- **FR-014**: System MUST provide diagnostics for fiber topology, including orphan cables, empty enclosures, disconnected strands, missing endpoints, and invalid cross-project links.
- **FR-015**: System MUST allow users to import, register, preview where supported, tag, classify, and search project files.
- **FR-016**: System MUST support full-project search across files, tasks, features, metadata, and domain entities with ranked results and filters.
- **FR-017**: System MUST support project task management, including status, progress, dates, hierarchy, dependencies, and warnings for invalid dependency loops.
- **FR-018**: System MUST produce project reports that can include selected metadata, quantities, map captures, summaries, and generated tables.
- **FR-019**: System MUST support offline analysis workflows for OCR, image/object detection, embeddings/search assistance, metadata normalization, and user correction capture.
- **FR-020**: System MUST allow users to review, accept, edit, or reject generated analysis output before it becomes authoritative project metadata.
- **FR-021**: System MUST keep core project, map, file, and task workflows usable when optional analysis features are unavailable, disabled, or not loaded.
- **FR-022**: System MUST provide user-visible progress, completion, and failure feedback for long-running imports, analysis jobs, migration, report export, and large map loads.
- **FR-023**: System MUST prevent data loss from interrupted writes, concurrent writes, failed migration, unsupported schema versions, and application shutdown during active operations.
- **FR-024**: System MUST support Vietnamese and English user-facing workflows for primary navigation, labels, search, and project documentation metadata.
- **FR-025**: System MUST define quality gates for major changes, including unit or integration coverage for data persistence, map behavior, fiber topology, report export, migration, and search.

### Key Entities *(include if feature involves data)*

- **Project Package**: Portable container for project metadata, managed entities, references, history, and derived project data.
- **Project**: The user-facing project record with name, status, root context, dates, summary metadata, and workspace settings.
- **File**: A managed document or asset with path/reference information, classification, extracted metadata, preview state, and search content.
- **Task**: A work item with status, progress, dates, hierarchy, dependencies, linked files/features, and execution metadata.
- **Map Layer**: A logical grouping for map features with visibility, ordering, styling, and ownership context.
- **Map Feature**: A spatial object such as point, polyline, polygon, camera, cable route, asset, or annotation with geometry and metadata.
- **Design Event**: A recorded change to project design state, used for auditability, replay, synchronization, or projection into current views.
- **Fiber Cable**: A network route derived from or linked to a map feature, with type, owner, capacity, status, and endpoint information.
- **Fiber Strand**: An individual strand within a cable, with number, color, status, and connectivity relationships.
- **Fiber Cable Point**: A start, end, or enclosure point linked to a cable route and spatial feature.
- **Fiber Port**: A connection point on ODF or network equipment with label, direction, status, and termination/patch relationships.
- **Fiber Splice**: A connection between two strands at an enclosure, optionally with measured loss.
- **Fiber Circuit**: An A-to-Z service path made from ordered strand, splice, port, and patch hops.
- **Analysis Result**: Generated OCR, detection, embedding, summary, or normalized metadata output awaiting user review or acceptance.
- **Report**: A generated project document containing selected project metadata, map imagery, quantities, findings, or tabular summaries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create, close, move, reopen, and verify a representative project package in under 5 minutes without broken internal project references.
- **SC-002**: A representative project containing files, tasks, layers, features, and metadata reopens with 100% of saved entities present after a normal restart.
- **SC-003**: For a project with 10,000 map features, the user sees the project shell and first useful map viewport within 5 seconds on a supported workstation.
- **SC-004**: At least 95% of common map edits complete with visible UI feedback within 1 second for representative project sizes.
- **SC-005**: Fiber route materialization creates cable, endpoint, and strand inventory with no orphan records for 100% of valid input routes in the acceptance dataset.
- **SC-006**: Fiber circuit tracing identifies a complete path or a precise break reason for 100% of circuits in the acceptance dataset.
- **SC-007**: Search returns relevant results for Vietnamese accented, unaccented, and mixed-case queries within 2 seconds for a representative project.
- **SC-008**: Report export produces a document containing all selected sections, map captures, and metadata in at least 95% of acceptance runs without manual file repair.
- **SC-009**: Legacy migration tests preserve the original source package and produce a readable migration report for every supported legacy sample.
- **SC-010**: Optional analysis features can be enabled, used, released, or skipped without blocking project creation, map editing, file management, or report export.
- **SC-011**: User-corrected analysis metadata replaces generated values accurately in 100% of reviewed correction scenarios.
- **SC-012**: Critical persistence, migration, search, map editing, fiber topology, and report export workflows each have automated test coverage or a documented manual acceptance procedure.

## Assumptions

- The baseline spec describes the intended product behavior synthesized from the current repository and documentation, not a single narrow bug fix.
- `.pmp` is treated as the product's portable project package concept and remains part of the user-facing vocabulary.
- Local-first desktop use is the default; cloud or mobile synchronization is optional and must not be required for core project work.
- Existing Vietnamese engineering/GIS/telecom workflows are in scope, including fiber network inventory and camera/DORI planning.
- The product may keep implementation-specific architecture documents separately; this Speckit spec intentionally focuses on behavior, acceptance, entities, and measurable outcomes.
- Where existing docs disagree on completed status, this baseline records the desired product capability and leaves implementation status to later planning/tasks.
