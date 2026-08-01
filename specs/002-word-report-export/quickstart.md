# Quickstart: Validate Word Design Report Export

## Prerequisites

- Existing project with at least one intersection, one route/polyline, and one object with site photos.
- App dependencies installed.

## Validation

1. Run report model and DOCX tests:

   ```powershell
   npm run test -- src/modules/design/features/reports/word
   ```

2. Run map capture/renderer tests:

   ```powershell
   npm run test -- src/modules/design/features/map/MapLayerComponents src/modules/design/features/map/MapLibreFastRenderer.test.tsx
   ```

3. Run typecheck:

   ```powershell
   npm run typecheck
   ```

4. Manual smoke:

   - Open Word export.
   - Edit the report title.
   - Preview an intersection and route section.
   - Export Word.
   - Confirm route image hides unrelated routes.
   - Confirm site photos appear and missing photo warnings are visible.
