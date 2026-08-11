---
title: backend
description: Current Rust/Tauri backend, V2 SQLite storage pipeline, workspace crates and IPC boundary.
createdAt: '2026-08-11T04:49:35.181Z'
updatedAt: '2026-08-11T04:50:54.491Z'
tags:
  - architecture
  - backend
  - rust
  - tauri
  - sqlite
  - source-aligned
---

# Backend Rust Architecture — Current Source-Aligned View

Canonical full summary: @doc/architecture/project-summary-current-state.

## Runtime

Backend is Rust/Tauri v2 with Tokio. src-tauri/src/main.rs calls design_core::run in src-tauri/src/lib.rs. Startup initializes the V2 database/StorageWorker, app state hydrator, BasemapWorker, GisStreamWorker and AiState, then registers Tauri commands.

## Storage boundary

Tauri commands send StorageCommand messages through ActorState.gateway_tx. StorageWorker serializes query/write/batch operations against SQLite and owns project storage concerns such as:

- .pmp open/bootstrap, project state, save/force-save and migration.
- Event append/replay, snapshots, undo/redo and sync outbox.
- Feature/file queries, FTS, viewport data and map tile cache.
- Media assets, import/export, backups, restore and recovery.
- Integrity audit and project storage health.

The active schema is version 11 (label 11.0.0), compatible from version 8. Core tables cover projects/files, Region → Layer → Feature Group → Feature, map tiles, media, events/sync, FTS5, AI, fiber topology/equipment and design history.

## Workspace crates

- app_domain: application/domain logic.
- gis_engine: geometry, coordinates and GIS exchange.
- module_gis: GIS data/module integration.
- module_p2p: libp2p mDNS/gossipsub sync service.
- shared_kernel: shared errors, logging and utilities.

## Command groups

Project/file lifecycle, design events, map/viewport/tile, fiber inventory/validation, storage health/backup/media, sync, AI, dashboard/analytics and import/export/report flows are exposed through V2 commands. Request/response serde names and frontend contracts must be changed together.

## Verification

Use npm run check:backend: cargo fmt --check, cargo check workspace/all-targets, cargo test workspace and cargo clippy -D warnings. See @doc/guides/development.
