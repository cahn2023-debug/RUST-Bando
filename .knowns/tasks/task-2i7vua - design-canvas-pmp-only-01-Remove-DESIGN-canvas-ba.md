---
id: 2i7vua
title: "[design-canvas-pmp-only-01] Remove DESIGN canvas background"
status: done
priority: medium
labels:
  - from-spec
  - spec:design-canvas-pmp-only
  - spec-date:2026-08-15
createdAt: '2026-08-15T09:43:32.375Z'
updatedAt: '2026-08-15T10:43:25.424Z'
completedAt: '2026-08-15T10:04:54.777Z'
timeSpent: 1235
assignee: '@me'
spec: specs/2026-08-15/design-canvas-pmp-only
fulfills:
  - AC-1
order: 10
---
# [design-canvas-pmp-only-01] Remove DESIGN canvas background

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove map/GIS, tile, grid and canvas background rendering from the DESIGN canvas while preserving feature layers and interaction overlays.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Canvas renders transparent with no map, GIS, tile, satellite, grid or canvas background layer.
- [x] #2 Opening DESIGN makes no background-map network request.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove the `neutral-background` MapLibre background layer from `createMapStyle()` and make the fast map surface transparent in `MapLayer.css`, without changing feature or interaction overlay layers.
2. Add focused regression coverage for the style contract: no background layer, no tile sources, and feature/overlay sources remain installable.
3. Run the targeted map renderer tests plus the project TypeScript/lint check available for the touched frontend package.
4. Validate the task and record AC status, System Decision Impact, and Spec Decision Compliance for D1-D4.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan check: AC-1 is covered by steps 1-2; AC-2 is covered by steps 1-3. No new dependency or durable system guidance; D1=pass, D2=pass, D3=pass, D4=pass.
Review: PASS — 0 P1, 0 P2, 0 P3. Diff is limited to the MapLibre style background, the map surface CSS, and one focused regression test. Artifact verification: EXISTS, substantive, and wired; the test imports and exercises `createMapStyle`, while the existing renderer suite covers feature and overlay source hydration.
Verification: targeted Vitest passed (2 files, 32 tests); ESLint reported 0 errors and only pre-existing warnings in MapLibreFastRenderer.tsx; package typecheck remains blocked by unrelated existing errors in RibbonTabContent.tsx and userConfirmation.ts.
System Decision Impact: none — this is an implementation-only rendering change within the approved spec and adds no durable project guidance.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass
<!-- SECTION:NOTES:END -->

