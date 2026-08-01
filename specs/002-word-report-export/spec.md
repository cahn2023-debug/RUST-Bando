# Feature Specification: Word Design Report Export

**Feature Branch**: `[002-word-report-export]`  
**Created**: 2026-08-01  
**Status**: Draft  
**Input**: User description: "Xuat bao cao thiet ke thanh file Word: sua tieu de truoc khi xuat, anh tong the chua du doi tuong, anh tuyen an tuyen khac, co day du site photo."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit Report Title Before Export (Priority: P1)

As a designer, I want to edit the report title in the export dialog before creating the Word file so the generated document uses the correct project/report name.

**Why this priority**: The title is the first visible document field and must match the user's delivery package.

**Independent Test**: Open Word export, edit the title, preview/export, and confirm the preview, document title, and default filename use the edited title.

**Acceptance Scenarios**:

1. **Given** the export dialog is open, **When** the user changes the title, **Then** the preview heading updates to the new title.
2. **Given** the user leaves the title empty, **When** export starts, **Then** the system uses the default project report title.

---

### User Story 2 - Capture Complete Report Map Images (Priority: P1)

As a designer, I want exported map images to frame all relevant objects so each report section is visually complete.

**Why this priority**: Missing route or intersection context makes the exported report unreliable for review.

**Independent Test**: Export an intersection and a route section, then inspect Word images for full object coverage and hidden unrelated routes.

**Acceptance Scenarios**:

1. **Given** an intersection is selected, **When** the map image is captured, **Then** the image includes the intersection and direct child objects.
2. **Given** a route is selected, **When** the map image is captured, **Then** the image includes the whole route and intersection markers passed by the route.
3. **Given** a route is selected, **When** the map image is captured, **Then** unrelated routes are hidden from that image.

---

### User Story 3 - Include Site Photos Reliably (Priority: P1)

As a report author, I want all available site photos attached to selected objects to appear in the Word report, with warnings for missing photos, so I can deliver a useful report without losing visible evidence.

**Why this priority**: Site photos are primary field evidence and should not be silently omitted.

**Independent Test**: Export objects with data URL photos, asset-backed photos, missing photos, and unresolved assets; confirm valid photos appear and warnings are shown for missing/unresolved ones.

**Acceptance Scenarios**:

1. **Given** an object has multiple site photos, **When** the report is exported, **Then** all resolved photos are embedded in order.
2. **Given** an object has no site photo, **When** the report is exported, **Then** the Word report includes a warning for that object.
3. **Given** one photo cannot be resolved, **When** export runs, **Then** export continues and reports the unresolved photo warning.

### Edge Cases

- Selected route has no detected intersection markers.
- Selected route overlaps another unrelated route.
- Selected intersection has no child objects.
- Site photo exists as a data URL, asset ID, or external URL.
- One photo fails to resolve while other photos for the same object are valid.
- Map capture fails for one section while the report still has other valid content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow the report title to be edited before Word export.
- **FR-002**: System MUST use the effective title in preview, generated Word content, and default save filename.
- **FR-003**: System MUST compute capture scope for each report section.
- **FR-004**: System MUST capture intersection sections with the intersection and direct child objects visible.
- **FR-005**: System MUST capture route sections with the selected route and intersection markers on the route visible.
- **FR-006**: System MUST hide unrelated route/line objects during route capture only.
- **FR-007**: System MUST restore normal map rendering after capture succeeds or fails.
- **FR-008**: System MUST include all resolved site photos for each object in the Word report.
- **FR-009**: System MUST warn when selected objects have missing or unresolved site photos.
- **FR-010**: System MUST continue exporting when site photo warnings exist.

### Key Entities

- **Report Model**: Export-ready document state including title, selected sections, capture scope, photos, and warnings.
- **Report Section**: One selected feature/route/intersection with summary, details, map bounds, and capture scope.
- **Capture Scope**: Temporary map rendering instructions containing focused and hidden feature IDs.
- **Report Photo**: Site photo reference or resolved image with optional warning.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Edited titles appear in preview and generated document in 100% of title edit scenarios.
- **SC-002**: Route captures hide unrelated routes in 100% of route capture acceptance cases.
- **SC-003**: Intersection captures include selected intersection and direct children in 100% of acceptance cases.
- **SC-004**: Export completes when missing site photos exist and surfaces at least one warning per affected object.
- **SC-005**: All available data URL and asset-backed photos are embedded in their original order in acceptance cases.

## Assumptions

- Route means line/polyline feature.
- Intersection markers are point features identified by existing display metadata.
- Route capture shows the route and intersection markers only; route child objects such as cameras are hidden.
- Missing site photos warn but do not block export.
