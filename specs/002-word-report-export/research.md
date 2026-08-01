# Research: Word Design Report Export

## Decision: Keep report export client-side

**Rationale**: The current flow already builds the report model, captures map images, resolves media assets, and builds DOCX in the frontend. Extending this avoids backend/schema changes.

**Alternatives considered**: A backend Word generator was rejected because it would duplicate existing DOCX and map image flow.

## Decision: Use temporary map capture scope

**Rationale**: Route capture needs to hide unrelated routes only during export. A custom event with focus/hidden IDs lets the renderer temporarily filter GeoJSON without mutating design store visibility.

**Alternatives considered**: Persisting hidden IDs in the store was rejected because it could affect the user's real map state.

## Decision: Warn but continue for missing site photos

**Rationale**: Users preferred export completion with visible warnings. This preserves valid report data and avoids blocking delivery because of one missing photo.

**Alternatives considered**: Blocking export was rejected by product decision; silent omission was rejected because it hides data quality issues.
