# Project Overview

Last audited: 2026-08-05

## Summary

Project Manager is a desktop application built with Tauri v2, Rust, React 19,
TypeScript, Vite, Tailwind CSS v4, and SQLite. The product is centered on
offline project management for design/GIS workflows, with `.pmp` project files,
map-centric editing, implementation/project-management modules, contract/report
features, and AI/vector/search dependencies available in the Rust workspace.

## Current Source-Aligned Facts

- `package.json` defines the app as `project-manager` version `1.2.0`.
- Frontend entry points live under `src/modules/home`.
- Active frontend modules include `home`, `design`, `implement`, `contract`,
  `analytics`, `i18n`, and `tool`.
- Current app shell mounts `BasemapProvider`, `MapProvider`,
  `PersistentBasemapHost`, and `BasemapControls`.
- Backend code lives in `src-tauri`, with Rust workspace crates under
  `src-tauri/crates`.
- Current backend storage flow includes a `StorageWorker` handling `.pmp`
  database operations, project snapshots, media assets, map tiles, backups,
  health checks, undo/redo, and import/export-related commands.

## Documentation State

The documentation set is broad but uneven. There are active feature docs for map
and report-export work, many historical plans/reports, duplicated overview docs,
large generated knowledge dumps, and older architecture documents that no longer
match the current MapLibre/basemap direction.

Use `docs/INDEX.md` as the gateway and `DOCUMENT_STATUS.md` before trusting any
older plan, report, or architecture note.

