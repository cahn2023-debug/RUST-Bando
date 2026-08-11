---
id: 20260809-1318-canonical-feature-symbol-contract-for-icon-type-color-and-pixel-size
title: Canonical feature symbol contract for icon type, color, and pixel size
status: draft
supersedes: []
supersededBy: []
tags:
  - map
  - icons
  - svg
  - maplibre
  - frontend
  - design-system
sources:
  - src/modules/tool/utils/featureSymbolStyle.ts
  - src/modules/tool/utils/featureDisplay.ts
  - src/modules/design/components/icons/MapIcons.tsx
  - src/modules/design/features/map/mapLibreFastAdapter.ts
  - src/modules/design/features/map/services/mapImageService.ts
  - src/modules/design/components/core/PropertyPanel.tsx
relatedDocs:
  - architecture/frontend
  - guides/development
relatedTasks:
  - 9bp8ef
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "9bp8ef" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedAt: '2026-08-09T06:18:24.482Z'
createdAt: '2026-08-09T06:18:24.482Z'
updatedAt: '2026-08-09T06:18:24.482Z'
---

## Context

Feature symbols were normalized independently in PropertyPanel, React icon previews, SVG rasterization, and MapLibre GeoJSON. That allowed icon aliases, unsafe SVG color values, fallback colors, and camera/intersection sizes to diverge between preview, map rendering, and persisted metadata.

## Decision

Use src/modules/tool/utils/featureSymbolStyle.ts as the shared feature-symbol contract. Normalize icon aliases to the supported IconType set, accept only safe CSS color values with geometry-aware defaults, clamp point and line sizes to their shared bounds, and treat the persisted point size as the final MapLibre bitmap pixel size. MapIcons.tsx remains the single SVG source; PropertyPanel persists canonical metadata plus the compatibility properties mirror.

## Alternatives Considered

Keep each renderer's local normalization; retain duplicate CameraIcons SVG generation; apply an implicit scale factor to camera/intersection bitmap sizes; store only one metadata representation without the legacy properties mirror.

## Consequences

Property previews, SVG strings, MapLibre image IDs/bitmaps, and saved feature values share the same icon/color/size invariants. Camera and intersection images may use different cache keys after size/color changes, while the existing bounded image cache limits growth. This draft requires human review before it becomes an accepted project decision.
