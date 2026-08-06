# Documentation Index

Last audited: 2026-08-05

This is the primary documentation gateway for the repository. For any large task,
read this file first, then open only the context-pack files and source docs that
match the task.

## Read Order

1. `docs/context-pack/PROJECT_OVERVIEW.md`
2. `docs/context-pack/ARCHITECTURE_MAP.md`
3. `docs/context-pack/DIRECTORY_MAP.md`
4. `docs/context-pack/SYSTEM_REGISTRY.md`
5. `docs/context-pack/DOCUMENT_STATUS.md`
6. Task-specific specs, plans, reports, or troubleshooting notes

Agent-specific guidance starts at `docs/AGENTS.md` and `docs/KNOWNS.md`.

## Current Truth

- Product: Tauri v2 desktop app named `project-manager`.
- Frontend: React 19, TypeScript, Vite, Tailwind CSS v4, Zustand.
- Backend: Rust/Tauri, SQLite-backed `.pmp` project storage, event/snapshot pipeline.
- Current map stack in source: persistent basemap host plus MapLibre-oriented rendering.
- Important mismatch: several older docs still describe Leaflet-only or pre-basemap
  architecture. Treat those as historical unless confirmed against source.

## Context Pack

- `docs/context-pack/PROJECT_OVERVIEW.md` - concise project state.
- `docs/context-pack/ARCHITECTURE_MAP.md` - current architecture and source alignment.
- `docs/context-pack/DIRECTORY_MAP.md` - repository directory roles.
- `docs/context-pack/SYSTEM_REGISTRY.md` - active subsystems and source anchors.
- `docs/context-pack/ACTIVE_SKILLS.md` - active agent/project operating docs.
- `docs/context-pack/KNOWN_ISSUES.md` - documentation and source/doc drift.
- `docs/context-pack/CURRENT_PRIORITIES.md` - inferred active work areas.
- `docs/context-pack/DOCUMENT_STATUS.md` - audit classification.

## Active Source Docs

- `docs/KNOWNS.md`
- `docs/AGENTS.md`
- `docs/STYLE_GUIDE.md`
- `docs/FRONTEND_CODE_LAYOUT.md`
- `docs/MAPLIBRE_GOOGLE_MAPS_RENDER_FEATURE.md`
- `docs/UI_MAP_FEATURES_SUMMARY.md`
- `docs/UI_UX_DOCUMENTATION.md`
- `docs/WORD_REPORT_EXPORT_FEATURE.md`
- `specs/002-word-report-export/spec.md`
- `docs/PLAN-map-ui-standardization.md`
- `docs/PRODUCT_STANDARDIZATION_PLAN.md`

## Review Before Trusting

- `docs/README.md`, `docs/PROJECT_OVERVIEW.md`, and
  `docs/architecture/system_overview.md` contain useful intent but also encoding
  damage and architecture drift.
- `docs/project_index.html` was previously documented as an SSOT, but this audit
  establishes `docs/INDEX.md` as the readable gateway. Keep `project_index.html`
  as a generated or historical artifact until it is revalidated.
- Very large or generated docs such as `docs/NOTEBOOK_LM_*.md`,
  `docs/udnl_upload.md`, and `docs/architecture/CODEBASE_MAP.md` should not be
  loaded during normal task startup.

## Status Vocabulary

- `ACTIVE`: aligned enough with current source to use as task context.
- `NEEDS_REVIEW`: useful but must be verified against source before acting.
- `STALE`: describes older implementation, solved issue, or obsolete direction.
- `DUPLICATE`: substantially overlaps another doc; use the canonical path listed.
- `ARCHIVE_CANDIDATE`: keep for history, but remove from normal task flow.

