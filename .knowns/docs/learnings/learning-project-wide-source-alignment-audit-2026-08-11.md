---
title: 'Learning: Project-wide source alignment audit 2026-08-11'
description: Patterns, decisions and failures found while consolidating the whole repository into Knowns.
createdAt: '2026-08-11T04:49:00.898Z'
updatedAt: '2026-08-11T04:50:54.091Z'
tags:
  - learning
  - architecture
  - documentation
  - project-state
---

# Learning: Project-wide source alignment audit 2026-08-11

## Patterns

### Source-aligned project summary
- What: Keep one current Knowns architecture summary that separates live source, archived snapshots, accepted knowledge and draft plans.
- When to use: At session start, before a broad refactor, or when repository documentation conflicts.
- Source: @doc/architecture/project-summary-current-state
- Evidence: src/modules/home/main.tsx, src-tauri/src/lib.rs, schema.rs, package.json, task board and BAK manifests.

### Typed vertical slices
- What: Implement each rewrite slice through domain model, typed IPC adapter, state/store, UI and tests, with SQLite schema/commands as the contract.
- When to use: Project/File, Map/Feature, Fiber/Inventory and Sync/AI/Reports work.
- Source: @task-7qmhzr

## Decisions

### Keep live frontend and replacement archive distinct
- Chose: Treat src/modules/home/main.tsx and the restored legacy src tree as live; treat replacement frontend under BAK/archive/2026-08-09/replacement-frontend as an archived experiment until an explicit swap is completed.
- Over: Assuming the replacement draft decision means src/app is active.
- Tag: SURPRISE / TRADEOFF
- Outcome: The project summary reflects the actual entrypoint and avoids sending future work to missing src/app files.
- Recommendation: Any future frontend swap must update index.html, restore/build the selected tree, rerun both quality gates and update the BAK manifest/task state.

## Failures

### Documentation drift
- What went wrong: Older docs and Knowns summaries describe Leaflet, old root crate layouts or replacement frontend state that no longer matches the live checkout.
- Root cause: Multiple historical plans/reports were retained without a single source-aligned current-state document.
- Prevention: Use @doc/architecture/project-summary-current-state and docs/context-pack/DOCUMENT_STATUS.md; verify code paths before relying on older docs.

### Ambiguous rewrite status
- What went wrong: Draft System Decisions and parent task notes can make the replacement frontend appear active even though live index.html still targets the legacy entrypoint.
- Root cause: Archive/restore history and active-vs-draft knowledge were not surfaced together.
- Prevention: Record archive paths/manifests and live entrypoint in every frontend architecture update.

### Validation limitation
- What went wrong: Knowns code index currently reports zero symbols and C# LSP installation is failing.
- Root cause: Index/LSP readiness is incomplete for some code intelligence paths.
- Prevention: Use CodeGraph where indexed, inspect targeted source/config files, and run frontend/backend quality gates before treating an architectural claim as verified.
