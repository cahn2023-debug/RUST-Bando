---
id: 20260812-2035-basemap-preview-uses-fixed-layer-capability-groups
title: Basemap preview uses fixed layer capability groups
status: draft
supersedes: []
supersededBy: []
tags:
  - basemap
  - preview
  - layers
  - contract
sources:
  - '@doc/specs/2026-08-12/separate-basemap-layers'
relatedDocs:
  - specs/2026-08-12/separate-basemap-layers
relatedTasks:
  - mwmawd
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "mwmawd" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches:
  - id: 20260811-1558-google-raster-tiles-are-preview-only-for-the-standalone-basemap-viewer
    title: Google raster tiles are preview-only for the standalone basemap viewer
    status: accepted
    score: 0.820000
    kind: conflict
    matchedBy:
      - 'lexical:conflict_topic'
    snippet: 'Cho phép standalone Basemap Preview dùng cố định Google raster tile template `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}` làm nguồn online chính. Ngoại lệ này chỉ áp dụng cho preview read-...'
    tags:
      - basemap
      - preview
      - google-tiles
      - draft
reviewAllowedResolutions: []
reviewEvaluatedAt: '2026-08-12T13:35:59.890Z'
createdAt: '2026-08-12T13:35:59.890Z'
updatedAt: '2026-08-12T13:35:59.890Z'
---

## Context

Vietnam Basemap Preview needs independent layer controls across local MapLibre styles. The approved separate-basemap-layers spec defines eight fixed groups and standard source-layer/ID mapping.

## Decision

Basemap Preview layer capability detection uses the fixed ordered groups landcover, water, boundaries, roads, labels, pois, buildings, and terrain. Local style layers are assigned by standard source-layer first, then by layer ID fallback; unmatched layers remain visible by default and are excluded from checkbox capabilities.

## Alternatives Considered

1. Expose every raw MapLibre style layer directly. 2. Infer groups only from layer IDs. 3. Use a fixed capability catalog with source-layer-first mapping and ID fallback.

## Consequences

UI and renderer can share a stable capability contract; packages with missing groups can hide those controls while custom layers remain visible. Future style changes must preserve standard source-layer/ID naming or add explicit mapping.
