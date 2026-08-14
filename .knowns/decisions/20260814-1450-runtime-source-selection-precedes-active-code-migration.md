---
id: 20260814-1450-runtime-source-selection-precedes-active-code-migration
title: Runtime source selection precedes active-code migration
status: draft
supersedes: []
supersededBy: []
tags:
  - architecture
  - migration
  - source-of-truth
sources:
  - data/manifests/active-code-inventory-2026-08-14.json
  - package.json
  - README.md
  - .knowns/docs/architecture/project-summary-current-state.md
  - data/manifests/active-code-workspace-migration-2026-08-14.json
  - data/README.md
relatedDocs:
  - specs/2026-08-14/active-code-workspace-standardization
relatedTasks:
  - r39gpa
  - svrusz
verification: []
reviewState: ready_for_review
reviewBlockers: []
reviewMatches: []
reviewAllowedResolutions:
  - accept_new
  - reject_new
reviewEvaluatedAt: '2026-08-14T08:57:17.710Z'
createdAt: '2026-08-14T07:50:48.279Z'
updatedAt: '2026-08-14T08:57:17.711Z'
---

## Context

The repository contains conflicting documentation about the Project Manager source tree. The root package delegate and README point to the BAK legacy-application tree while older architecture references point to root src/src-tauri.

## Decision

Use runtime/build evidence to select the source tree before moving active code. For the 2026-08-14 inventory, BAK/archive/2026-08-12/vietnam-basemap-preview-workspace-consolidation/legacy-application is the verified Project Manager runtime source because root npm run typecheck delegates to it and passes.

## Alternatives Considered

Treat the stale architecture documents as authoritative; move the root src/src-tauri tree without runtime confirmation; copy both trees and leave duplicate active sources.

## Consequences

Migration can proceed from a verified source and stale references can be updated deliberately. The candidate remains draft until the full workspace migration and integrated verification confirm the resulting canonical layout.
