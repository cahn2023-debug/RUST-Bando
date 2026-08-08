# PLAN: Live Real-Time Spec Preview on Map

## 1. Overview & Context
When users edit object specifications (size, color, icon, rotation, line thickness, stroke) in the Property Panel or Device Config panel on the right sidebar, the object on the MapLibre canvas currently does not reflect changes in real-time. The visual appearance on the map only changes after clicking "SAVE SPECS".
This plan defines the architectural changes to enable instantaneous live preview on the map as sliders/inputs change, with automatic rollback if the edit is canceled or un-saved.

## 2. Architecture & Design
- **State Flow**:
  1. User modifies a control (Color Picker, Size Stepper, Icon Selector, Rotation Input) in `PropertyPanel`.
  2. `PropertyPanel` dispatches `setPreview(selectedFeatureId, draftMeta, draftName)`.
  3. `useDesignSync` updates the in-memory transient `previewMetadata` state.
  4. `MapLibreFastRenderer` receives the updated `previewMetadata` and passes it to `buildMapLibreFeatureCollection`.
  5. `toRenderFeatures` in `mapLibreFastAdapter.ts` merges `previewMetadata` over the base feature for rendering, generating dynamic SVG icons or line styles.
  6. MapLibre GeoJSON sources and WebGL `FeatureOverlayCanvas` refresh instantaneously.
  7. If the user clicks **SAVE SPECS**, changes are committed to `state.features` and saved via API.
  8. If the user closes the panel or deselects, `setPreview(null, null)` clears the preview state and the map reverts to saved data.

## 3. Scope of Changes
- `src/modules/design/features/map/mapLibreFastTypes.ts`: Add `previewMetadata` to `BuildMapLibreFeatureCollectionInput`.
- `src/modules/design/features/map/mapLibreFastAdapter.ts`: Override feature properties with `previewMetadata` when rendering the previewed feature. Bypass/invalidate `featureRenderCache` for previewed feature ID.
- `src/modules/design/features/map/MapLibreFastRenderer.tsx`: Pass `previewMetadata` to `buildMapLibreFeatureCollection` and include in `useMemo` dependencies.

## 4. Risks & Mitigations
- **Performance / Memory Overhead**: `previewMetadata` affects only the currently selected feature. Invalidation is scoped to 1 feature ID, avoiding full map re-parsing.
- **State Leakage**: Unmounting PropertyPanel or changing selection already invokes `setPreview(null, null)` via cleanup effect.

## 5. Verification Plan
- Unit tests for `mapLibreFastAdapter` and `PropertyPanel`.
- Visual verification of live updates for Points, Lines, Polygons, and Camera FOVs.
