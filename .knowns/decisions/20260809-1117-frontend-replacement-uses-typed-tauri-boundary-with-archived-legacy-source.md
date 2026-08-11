---
id: 20260809-1117-frontend-replacement-uses-typed-tauri-boundary-with-archived-legacy-source
title: Frontend replacement uses typed Tauri boundary with archived legacy source
status: draft
supersedes: []
supersededBy: []
tags:
  - frontend
  - architecture
  - tauri
  - database
  - archive
sources:
  - '@doc/architecture/frontend'
  - '@doc/architecture/backend'
  - '@doc/architecture/overview'
  - '@doc/guides/development'
  - src-tauri/src/domain/implement/modules/v2/storage/schema.rs
  - BAK/archive/2026-08-09/frontend/MANIFEST.md
relatedDocs:
  - architecture/frontend
  - architecture/backend
  - architecture/overview
  - guides/development
relatedTasks:
  - 7qmhzr
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "7qmhzr" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedAt: '2026-08-09T04:17:35.953Z'
createdAt: '2026-08-09T04:17:35.953Z'
updatedAt: '2026-08-09T04:17:35.953Z'
---

## Context

The legacy React frontend was archived under BAK/archive/2026-08-09/frontend before replacement work. The new frontend must remain buildable while domain slices are rewritten against the canonical .pmp SQLite schema and Tauri v2 commands.

## Decision

The replacement frontend starts from src/app and database-backed contracts under src/contracts, and all Tauri IPC access goes through src/infrastructure/tauri/invoke.ts. The archived frontend remains immutable under BAK/archive/2026-08-09/frontend with a hash manifest; src-tauri and its SQLite schema remain the runtime source of truth.

## Alternatives Considered

Keep the legacy frontend in place and refactor in situ; allow components to call Tauri directly; archive without a buildable replacement shell.

## Consequences

The boundary checker must whitelist the new adapter. Each future vertical slice owns its domain types, typed API adapter, UI state and tests. Rollback is possible by restoring the archived source tree.
