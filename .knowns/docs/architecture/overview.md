---
title: overview
description: Current source-aligned overview of the Project Manager runtime and major subsystems.
createdAt: '2026-08-11T04:49:34.534Z'
updatedAt: '2026-08-11T04:50:54.248Z'
tags:
  - architecture
  - overview
  - source-aligned
  - current-state
---

# Overall Architecture — Current Source-Aligned View

Canonical full summary: @doc/architecture/project-summary-current-state.

## Product

Project Manager is a Tauri v2 desktop application for design records, GIS/map editing, implementation/operations, contracts/reports, fiber topology, synchronization and AI-assisted project workflows.

## Runtime flow

React 19 + TypeScript + Vite
→ typed/safe Tauri IPC adapters
→ Rust Tauri commands
→ ActorState/mpsc StorageCommand gateway
→ StorageWorker
→ SQLite .pmp storage, event/projection, map tile, media, backup and health flows.

The live frontend entrypoint is src/modules/home/main.tsx and the shell is src/modules/home/App.tsx. The replacement frontend under BAK/archive/2026-08-09/replacement-frontend is archived, not the active entrypoint.

## Source of truth

- Runtime data contract: src-tauri/src/domain/implement/modules/v2/storage/schema.rs.
- Command contract: src-tauri/src/domain/implement/commands/v2.rs and v2_bridge.rs.
- Storage execution: src-tauri/src/domain/implement/modules/v2/pipeline/worker_storage.rs.
- Frontend contracts/adapters: src/contracts/tauri-api and existing IMPLEMENT/lib/tauri.
- Historical plans and generated docs are context only until verified against live source.

## Main subsystems

Frontend: home, design/map, implement/project management, contract, analytics, i18n, tool, core basemap and shared utilities.

Backend: implementation domain, V2 storage/event pipeline, GIS, basemap and AI workers, plus workspace crates app_domain, gis_engine, module_gis, module_p2p and shared_kernel.

## Current caveats

Map architecture is MapLibre-oriented with a persistent basemap host; older Leaflet-only documents are stale. Schema version is 11. Frontend rewrite parent task remains in-progress while Project/File, Fiber/Inventory and Sync/History/AI/Reports child slices remain todo.

See also: @doc/architecture/backend, @doc/architecture/frontend, @doc/guides/development.
