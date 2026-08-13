---
id: 20260813-0843-best-effort-google-public-street-view-coverage-in-preview
title: Best-effort Google public Street View coverage in preview
status: draft
supersedes: []
supersededBy: []
tags:
  - pegman
  - street-view
  - preview
  - coverage
  - best-effort
sources:
  - 'https://developers.google.com/maps/documentation/javascript/reference/street-view'
  - 'https://developers.google.com/maps/documentation/javascript/streetview'
  - 'https://developers.google.com/maps/documentation/streetview/metadata'
relatedDocs:
  - specs/2026-08-13/google-public-street-view-coverage-overlay-fallback
relatedTasks:
  - idc190
  - iibd2k
  - vl95yh
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "idc190" is "todo"; all linked tasks must be done before accepting decision "20260813-0843-best-effort-google-public-street-view-coverage-in-preview"'
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
reviewEvaluatedAt: '2026-08-13T01:52:44.781Z'
createdAt: '2026-08-13T01:43:20.515Z'
updatedAt: '2026-08-13T01:52:44.784Z'
---

## Context

The standalone basemap preview needs a visible Street View coverage overlay when Pegman is activated, but the product currently does not provide a Google Maps JavaScript API key. The approved Pegman coverage spec uses package-local coverage and explicitly excludes Google coverage/metadata APIs.

## Decision

Allow the preview-only Pegman flow to attempt loading viewport-scoped Street View coverage from the public Google Maps web experience without an API key. Treat the source and payload as best-effort and non-contractual: isolate the adapter/parser, do not persist or index Google coverage data, keep the existing public Street View window for viewing, and use coordinate fallback when coverage is unavailable or invalid.

## Alternatives Considered

1. Require Maps JavaScript API plus an API key and use StreetViewCoverageLayer. 2. Keep package-local coverage only. 3. Use another licensed Street View provider. 4. Use undocumented public Google web coverage as a preview-only best-effort source.

## Consequences

The overlay may be empty, unavailable, or break when Google changes its web experience. The UI must remain usable through silent overlay hiding and coordinate-based Street View fallback. The implementation must not expose credentials, treat the payload as durable data, or make the public source a production platform dependency.
