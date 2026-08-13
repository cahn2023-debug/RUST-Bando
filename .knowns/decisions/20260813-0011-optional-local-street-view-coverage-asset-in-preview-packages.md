---
id: 20260813-0011-optional-local-street-view-coverage-asset-in-preview-packages
title: Optional local Street View coverage asset in preview packages
status: draft
supersedes: []
supersededBy: []
tags:
  - basemap-preview
  - street-view
  - coverage
  - package-contract
sources:
  - '@doc/specs/2026-08-12/pegman-street-view-coverage-selection-and-fallback'
relatedDocs:
  - specs/2026-08-12/pegman-street-view-coverage-selection-and-fallback
relatedTasks:
  - 552dl2
  - bk4txh
  - mzpvou
verification: []
reviewState: ready_for_review
reviewBlockers: []
reviewMatches: []
reviewAllowedResolutions:
  - accept_new
  - reject_new
reviewEvaluatedAt: '2026-08-12T17:21:38.873Z'
createdAt: '2026-08-12T17:11:12.613Z'
updatedAt: '2026-08-12T17:21:38.873Z'
---

## Context

Pegman coverage must work without Google Coverage/Metadata/Maps JavaScript API or an API key. Existing preview packages must remain compatible when no coverage asset is present.

## Decision

Preview package manifests may declare an optional package-relative assets.streetViewCoverage JSON asset. The asset contains local Street View segments and panoramas used by the preview selector; omission is valid and means no local coverage is available. Google public Street View remains limited to the existing viewing window.

## Alternatives Considered

Require a coverage asset in every package; call Google coverage APIs; keep coverage outside the package manifest.

## Consequences

The manifest and builder support an optional local coverage path with package-path validation and asset copying. Existing packages continue to deserialize without the field; packages without the asset show no coverage.
