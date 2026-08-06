# Current Priorities

Last audited: 2026-08-05

These priorities are inferred from current source state, dirty worktree paths,
and active-looking documents. They are not a product roadmap.

## Priority 1: Map UI And Basemap Stabilization

Signals:

- `docs/PLAN-map-ui-standardization.md` is new/untracked.
- `src/core/basemap/*` has active uncommitted files.
- `src/modules/design/features/map/*` has active uncommitted changes.
- App shell source mounts a persistent basemap host and controls.

Relevant docs:

- `docs/PLAN-map-ui-standardization.md`
- `docs/MAPLIBRE_GOOGLE_MAPS_RENDER_FEATURE.md`
- `docs/UI_MAP_FEATURES_SUMMARY.md`
- `docs/specs/SPEC_Basemap_Options.md`
- `docs/specs/SPEC_Basemap_Granular_Control.md`

## Priority 2: Storage And `.pmp` Reliability

Signals:

- Dirty backend files include Tauri lib/config and V2 storage connection/schema.
- Source contains storage worker commands for save, force-save, project health,
  backups, media recovery, map tile build/invalidation, and import flows.

Relevant docs:

- `docs/SPEC_PMP_V2.md`
- `docs/database/schema.md`
- `docs/database/DATABASE_AND_METADATA_COMPLETE.md`
- `docs/architecture/CURRENT_STORAGE_ARCHITECTURE_ANALYSIS.md`
- `docs/Fix V1 → V2 Design Migration And .pmp Hydration.md`

## Priority 3: Documentation Consolidation

Signals:

- Multiple overview, architecture, audit, and plan docs overlap.
- Some active docs are encoding-damaged or architecture-stale.
- No previous `docs/INDEX.md` existed before this audit.

Relevant docs:

- `docs/INDEX.md`
- `docs/context-pack/DOCUMENT_STATUS.md`
- `docs/KNOWNS.md`
- `docs/AGENTS.md`

## Priority 4: Report Export And Spec Alignment

Signals:

- `docs/WORD_REPORT_EXPORT_FEATURE.md` is recent.
- `specs/002-word-report-export/` contains a complete Speckit set.
- `specs/Fix-error-Display-on-Map-and-Database/` appears to reuse report-export
  contract filenames and needs review.

Relevant docs:

- `docs/WORD_REPORT_EXPORT_FEATURE.md`
- `specs/002-word-report-export/spec.md`
- `specs/002-word-report-export/contracts/report-export.md`
