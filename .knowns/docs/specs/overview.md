---
title: overview
description: Current product capability map and frontend rewrite delivery roadmap.
createdAt: '2026-08-11T04:49:37.445Z'
updatedAt: '2026-08-11T04:50:55.560Z'
tags:
  - spec
  - overview
  - roadmap
  - source-aligned
---

# System Specifications — Current Map

Canonical full summary: @doc/architecture/project-summary-current-state.

## Product capability areas

- GIS/map rendering: MapLibre, basemap presets/cache, vector features, bbox/viewport query, selection/editing, snapping, FOV/DORI and tile cache.
- Project/file/storage: .pmp lifecycle, SQLite schema, metadata, FTS5, snapshots, backups, media and import/export.
- Fiber/inventory: cables, strands, points, ports, terminations, patches, splices, circuits/hops and equipment.
- Sync/history: event log, outbox/cursor/conflict state, replay and undo/redo.
- AI/reporting: conversations/messages/actions/corrections, local/optional AI capabilities, dashboards and report/export flows.
- Implementation/contract workflows: tasks, notes, materials, contract records, analysis and file/content management.

## Delivery roadmap

The active Knowns roadmap is @task-7qmhzr:

1. Project/File/Metadata — @task-mup6bx — todo.
2. Map/Feature — @task-9bp8ef — done.
3. Fiber/Inventory — @task-f89qca — todo.
4. Sync/History/AI/Reports — @task-baxorm — todo.

## Spec hygiene

The repository has active and historical specs under docs/ and specs/. Prefer source-aligned Knowns docs and the explicitly linked task/spec. Use docs/context-pack/DOCUMENT_STATUS.md before relying on older or duplicate specs. The report-export Speckit set is active-looking but must still be checked against implementation before claiming completion.
