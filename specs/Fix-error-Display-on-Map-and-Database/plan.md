# Implementation Plan: Memory-Safe Word Report Map Export

## Summary

Harden the existing Word report export path by replacing data URL accumulation with binary image refs, validating required map geometry before accepting captures, and hiding transient renderer overlays while capture mode is active.

## Technical Approach

- Extend `ReportModel` sections with `requiredFeatureIds`, `requiredPoints`, and `captureWarnings`.
- Extend map capture payloads with `requiredFeatureIds`, `requiredPoints`, `captureKind`, and `pixelBudget`.
- Capture map canvas with `toBlob`/`Uint8Array`; use object URLs only for preview.
- Keep export captures out of React state and pass binary refs to DOCX generation.
- Use bounded pixel budgets and JPEG quality defaults to prevent memory spikes.
- In renderer capture mode, render report-focused features and empty transient overlay sources.
- Validate required points after `fitBounds`; retry with larger padding/lower zoom before failing.

## Validation

- `npm run test -- src/modules/design/features/reports/word`
- `npm run test -- src/modules/design/features/map/MapLayerComponents`
- `npm run test -- src/modules/design/features/map/MapLibreFastRenderer.test.tsx src/modules/design/features/map/mapLibreFastAdapter.test.ts`
- `npm run typecheck`
