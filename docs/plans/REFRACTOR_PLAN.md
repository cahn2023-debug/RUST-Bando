# REFRACTOR PLAN

## 1. Purpose

This document defines a safe refactor plan for the current Tauri application without changing:

- product features
- user-facing workflows
- Tauri app structure (`src` + `src-tauri`)
- `.pmp` project format
- IPC command names
- event names used across windows

The plan is designed for incremental execution. Each phase must end with a green verification gate before the next phase starts.

## 2. Current State Summary

### 2.1 Confirmed baseline

- Frontend lives in `src/`
- Tauri/Rust backend lives in `src-tauri/src/`
- Frontend build is currently [x] GREEN
- Rust backend `cargo check` is currently [x] GREEN
- The codebase already follows a rough domain split, but boundaries are inconsistent

### 2.1.1 Review Snapshot After Refactor Pass

- `npm run build` -> [x] PASS
- `cargo check --manifest-path src-tauri/Cargo.toml` -> [x] PASS
- `npm run test -- --run` -> [x] PASS
- `cargo test --manifest-path src-tauri/Cargo.toml` -> [x] PASS
- Frontend regression fixes verified in code:
  - `ProjectDetail` now propagates `contractType` through `ProjectSidebar`.
  - `Ribbon` export now reads fresh store state at action time.
- Test and backend stabilization fixes verified in code:
  - `cameraMath.test.ts` now uses the current `calculateDORIDistance` signature.
  - `goog_maps_polyline.test.ts` now matches the raw `payload.coordinates` contract.
  - Rust topology propagation no longer hangs while updating the spatial index.

### 2.1.2 Current Implementation Progress

- Canonical hook directory now exists: `src/IMPLEMENT/hooks`
- App shell decomposition has started and is visible in:
  - `src/HOME/App.tsx`
  - `src/HOME/AppBootstrap.tsx`
  - `src/HOME/AuthGuard.tsx`
  - `src/HOME/GlobalModals.tsx`
- Project detail decomposition has started and is visible in:
  - `src/IMPLEMENT/features/project-management/ProjectDetail.tsx`
  - `src/IMPLEMENT/features/project-management/ProjectSidebar.tsx`
  - `src/IMPLEMENT/features/project-management/ProjectMainView.tsx`
  - `src/IMPLEMENT/features/project-management/ProjectOverlayLayer.tsx`
- Ribbon decomposition has started and is visible in:
  - `src/DESIGN/components/ui/Ribbon.tsx`
  - `src/DESIGN/components/ui/RibbonTabContent.tsx`
- Backend bootstrap has been centralized:
  - `src-tauri/src/main.rs` is now thin
  - `src-tauri/src/lib.rs` is the single builder path
  - `src-tauri/src/IMPLEMENT/modules/bootstrap.rs` exists
- Database modularization has started:
  - `src-tauri/src/IMPLEMENT/db/schema.rs`
  - `src-tauri/src/IMPLEMENT/db/migrations.rs`
  - `src-tauri/src/IMPLEMENT/db/models.rs`
  - `src-tauri/src/IMPLEMENT/db/logic.rs`

### 2.2 Main problems discovered

1. Automated verification gates are restored.
   - `npm run build` is green.
   - `npm run test -- --run` is green.
   - `cargo check --manifest-path src-tauri/Cargo.toml` is green.
   - `cargo test --manifest-path src-tauri/Cargo.toml` is green.

2. Import path drift is largely fixed.
   - Canonical `src/IMPLEMENT/hooks` exists.
   - Legacy fake runtime import patterns have mostly been removed.

3. Major duplicate runtime modules appear converged.
   - Analysis runtime files are now under `src/IMPLEMENT/features/analysis/*`.
   - Duplicate runtime-critical modules are no longer the main blocker.

4. Some frontend orchestration files are too large and mix concerns.
   - `src/HOME/App.tsx` -> improved
   - `src/IMPLEMENT/features/project-management/ProjectDetail.tsx` -> improved
   - `src/DESIGN/components/ui/Ribbon.tsx` -> improved
   - `src/DESIGN/components/core/CADPanels/DrawingExplorer.tsx`
   - `src/IMPLEMENT/stores/useDesignSync.ts`

5. Backend bootstrap duplication risk has been reduced, but command-layer cleanup is not complete.
   - `src-tauri/src/main.rs` is now thin.
   - `src-tauri/src/lib.rs` still owns the command registry and full builder wiring.
   - This is acceptable for now, but command registration is still very large.

6. Documentation drift has been reduced substantially.
   - Core walkthrough and related planning docs are being aligned to canonical paths.

7. Remaining gaps are now concentrated in maintainability and manual verification.
   - `src/IMPLEMENT/stores/useDesignSync.ts` is still large.
   - `src/DESIGN/components/core/CADPanels/DrawingExplorer.tsx` is still large.
   - GUI smoke verification for multi-window flows is still pending.

## 3. Refactor Goals

### 3.1 Primary goals

- Restore a clean, buildable frontend baseline.
- Make module ownership explicit.
- Remove ghost imports and duplicated runtime modules.
- Reduce file size and mixed responsibilities in key orchestration files.
- Keep Rust command and frontend UI behavior stable.
- Improve maintainability, testability, and onboarding quality.

### 3.2 Secondary goals

- Reduce architectural drift between documentation and implementation.
- Make future feature work safer by creating clear layering rules.
- Make regression detection easier through targeted verification gates.

## 4. Non-Goals

The following are explicitly out of scope for this refactor plan:

- redesigning the UI
- adding new product features
- changing `.pmp` schema or migration behavior
- renaming Tauri commands already used by the frontend
- changing multi-window routing behavior
- changing AI model behavior or model packaging
- changing bundle targets or release packaging flow

## 5. Invariants That Must Not Break

These rules remain frozen throughout the refactor:

1. Keep the high-level project layout:
   - `src/`
   - `src-tauri/`

2. Keep all current window modes working:
   - main app
   - `view=analysis`
   - `view=print`
   - `view=streetview`

3. Keep current event names working:
   - `open-pmp`
   - `metadata-updated`
   - `sync-finished`
   - any other cross-window event already in active use

4. Keep currently registered Tauri command names unchanged.
   - Refactor implementation only, not public invoke contract.

5. Keep current TS contract shapes stable unless a separate migration plan is approved.
   - `src/CONTRACT/types.ts`

6. Keep current backend schema and project loading flow stable unless a dedicated schema change plan exists.

## 6. Target Architecture

The target architecture keeps the existing repo shape but makes ownership explicit.

### 6.1 Frontend target structure

- `src/HOME`
  - entrypoints
  - app shell
  - window routing
  - startup/bootstrap orchestration

- `src/DESIGN`
  - reusable presentational components
  - layout system
  - design-system-level UI pieces
  - static UI assets

- `src/IMPLEMENT/hooks`
  - app-level React hooks
  - orchestration hooks that combine stores + services

- `src/IMPLEMENT/stores`
  - Zustand stores
  - store-specific tests

- `src/IMPLEMENT/services`
  - IPC wrappers
  - import/export services
  - feature service adapters

- `src/IMPLEMENT/features/<domain>`
  - feature containers
  - feature-local components
  - feature-local glue code

- `src/TOOL/utils`
  - pure shared utility functions
  - math, geometry, metadata, formatting, decoding
  - no React and no UI concerns

- `src/CONTRACT`
  - shared TS data contracts and type definitions

### 6.2 Backend target structure

- `src-tauri/src/main.rs`
  - thin desktop entrypoint
  - builder composition only

- `src-tauri/src/lib.rs`
  - re-export layer and/or mobile-specific entry only
  - no second divergent desktop bootstrap path

- `src-tauri/src/IMPLEMENT/commands`
  - thin IPC command layer
  - command input/output normalization
  - no heavy domain logic

- `src-tauri/src/IMPLEMENT/modules/<domain>`
  - real domain logic
  - state handling
  - import/design/AI/core behavior

- `src-tauri/src/IMPLEMENT/db`
  - connection setup
  - schema
  - migrations
  - repository/query helpers

## 7. Refactor Rules

1. Refactor in small phases with green gates.
2. Do not combine frontend stabilization and deep architectural moves in one PR.
3. Prefer move + re-export shim before deletion.
4. Keep runtime behavior unchanged unless backed by a test or a manual verification case.
5. Do not rename public IPC contracts.
6. Do not change DB shape as part of structural cleanup.
7. Remove legacy code only after imports are fully converged.

## 8. Workstreams

The work is split into five main workstreams:

1. Frontend baseline stabilization
2. Frontend path normalization and de-duplication
3. Frontend shell and design/map decomposition
4. Backend bootstrap and DB modularization
5. Testing, documentation, and release gating

## 9. Detailed Execution Plan

## Phase 0 - Baseline Capture and Safety Net [COMPLETED]

### Goal

Create a reliable starting point before editing architecture.

### Tasks

- Record baseline command results:
  - `npm run build`
  - `npm run test`
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `cargo test --manifest-path src-tauri/Cargo.toml`

- Create a duplicate module inventory inside `src/`.
- Create a ghost import inventory:
  - imports that resolve to non-existent paths
  - imports that use legacy namespace patterns

- Create a smoke checklist for the app:
  - open app
  - open a recent project
  - open `.pmp` by association
  - switch to `DESIGN`
  - open `analysis`
  - open `print`
  - open `streetview`
  - import file
  - export file

- Freeze current public contracts:
  - TS contract file list
  - Tauri command list
  - event name list

### Deliverables

- written baseline log
- duplicate inventory
- ghost import inventory
- smoke checklist

### Exit Criteria

- all baseline failures are documented
- architectural invariants are written down before changes begin

## Phase 1 - Frontend Compile Stabilization [COMPLETED]

### Goal

Get the frontend back to a clean build without changing behavior.

### Results
- Fixed syntax errors in `useProjectDetailLogic.ts`.
- Resolved global `google` namespace in `StreetViewJS.tsx`.
- Validated `FileItem` prop signatures (`isActive`, `onSelect`).
- Restored `contractType` propagation through the refactored project shell.
- Removed stale-state export behavior from `Ribbon.tsx`.
- Updated frontend tests to match current runtime contracts.
- `npm run build` is Green.
- `npm run test -- --run` is Green.

### Tasks

- Fix TypeScript syntax errors first.
- Fix broken JSX and malformed expressions in current red files.
- Resolve missing import paths with the smallest safe change.
- If a path is legacy but still useful for compatibility:
  - create a temporary shim
  - or redirect import to the canonical module

- Prioritize current build blockers:
  - `src/DESIGN/components/core/CADPanels/DrawingExplorer.tsx`
  - `src/DESIGN/components/ui/Ribbon.tsx`
  - `src/IMPLEMENT/features/analysis/AnalysisDialog.tsx`
  - `src/IMPLEMENT/features/AnalysisDialog.tsx`
  - `src/IMPLEMENT/features/map/MapLayerComponents/FOVLayer.tsx`
  - `src/IMPLEMENT/features/map/MapLayerComponents/FovToggleTool.tsx`
  - `src/IMPLEMENT/features/map/MapLayerComponents/VertexEditor.tsx`
  - `src/IMPLEMENT/features/map/Palette/BulkEditPanel.tsx`
  - `src/IMPLEMENT/lib/firebase.ts`
  - `src/IMPLEMENT/stores/useDesignSync.ts`
  - `src/TOOL/utils/cameraMath.ts`
  - `src/TOOL/utils/designLogic.ts`
  - `src/TOOL/utils/metadataNormalization.ts`

### Notes

- This phase is not allowed to contain structural cleanup beyond what is needed to compile.
- Do not remove duplicate modules yet unless one of them directly breaks compilation and the replacement path is verified.

### Exit Criteria

- `npm run build` is green
- `npm run test` runs with no new failures
- app startup still works

### Current Status

- [x] build gate
- [x] frontend test gate
- [ ] manual startup verification fully documented (tracked in Phase 8)

## Phase 2 - Canonical Path Normalization [COMPLETED]

### Goal

Remove namespace drift and make import ownership predictable.

### Tasks

- Create or confirm canonical frontend directories:
  - `src/IMPLEMENT/hooks`
  - `src/IMPLEMENT/stores`
  - `src/IMPLEMENT/services`
  - `src/IMPLEMENT/features`
  - `src/TOOL/utils`

- Move top-level hooks into canonical hook ownership:
  - `useProjectManager`
  - `useProjectData`
  - `useMapSearch`
  - `useCamera`
  - `useCanvasInteraction`
  - `useDesignFeatures`
  - `useResizablePanels`
  - `useSnap`
  - `useWasmRenderer`

- Rewrite imports to canonical destinations.

- Eliminate these invalid or misleading import patterns from runtime code:
  - `@IMPLEMENT/features/stores/...`
  - `@IMPLEMENT/features/utils/...`
  - `@IMPLEMENT/features/hooks/...`

- Keep aliases stable:
  - `@HOME`
  - `@DESIGN`
  - `@CONTRACT`
  - `@IMPLEMENT`
  - `@TOOL`

### Recommended canonical ownership

- React hooks -> `src/IMPLEMENT/hooks`
- Zustand stores -> `src/IMPLEMENT/stores`
- pure utilities -> `src/TOOL/utils`
- IPC wrappers and adapters -> `src/IMPLEMENT/services`
- feature containers and feature-local UI -> `src/IMPLEMENT/features/<domain>`

### Exit Criteria

- no unresolved imports remain
- no runtime code imports from fake legacy paths
- module ownership is obvious from the path

### Current Status

- [x] `src/IMPLEMENT/hooks` exists
- [x] top-level hook ownership has largely moved into canonical paths
- [x] fake runtime import patterns appear removed from active code
- [x] docs and architecture references now point to canonical runtime ownership or explicit legacy-to-canonical mappings

## Phase 3 - Duplicate Module Convergence [COMPLETED]

### Goal

Eliminate parallel implementations for the same feature area.

### Tasks

- Choose a canonical owner for each duplicated module set.

- Likely convergence candidates:
  - `src/IMPLEMENT/features/analysis/*` becomes canonical for analysis UI
  - root-level `src/IMPLEMENT/features/Analysis*.tsx` becomes shim or is removed after migration
  - one `FeatureEditor.tsx` remains canonical after dependency analysis

- For each duplicate set:
  - identify all importers
  - choose the canonical file
  - redirect imports
  - keep a temporary compatibility re-export if needed
  - delete the duplicate only after all imports move

- Audit for other historical artifacts that should not stay in the build graph.

### Exit Criteria

- no duplicate runtime-critical modules remain inside `src/`
- each feature has one canonical implementation path

### Current Status

- [x] analysis runtime modules are consolidated under `src/IMPLEMENT/features/analysis`
- [x] duplicate runtime-critical filenames are no longer a dominant issue
- [x] no duplicate runtime-critical module set is currently blocking build or test gates

## Phase 4 - Frontend Shell Decomposition [COMPLETED]

### Goal

Reduce coupling and file size in high-orchestration frontend files.

### Scope
- [x] `src/HOME/App.tsx` (segmented into `AppBootstrap`, `AuthGuard`, `GlobalModals`)
- [x] `src/IMPLEMENT/features/project-management/ProjectDetail.tsx` (now uses `useProjectDetailLogic` and sub-views)
- [/] `src/DESIGN/components/ui/Ribbon.tsx` (partially segmented into `RibbonTabContent`)

### Tasks for `src/HOME/App.tsx`

- Extract startup loading screen
- Extract auth gate
- Extract window show/focus bootstrap logic
- Extract `open-pmp` event listener bridge
- Extract modal orchestration if it continues to grow

### Tasks for `ProjectDetail.tsx`

- Separate data loading from render tree composition
- Extract per-tab or per-mode routers
- Extract file-preview orchestration
- Extract BOM/metadata reload bridge
- Extract palette orchestration from project shell

### Tasks for `Ribbon.tsx`

- Split command groups into subcomponents
- Keep a single public `Ribbon` container
- Move side effects and backend toggles into dedicated hooks or services

### Exit Criteria

- `App.tsx` becomes a shell instead of a multi-purpose orchestrator
- `ProjectDetail.tsx` becomes a container with domain subviews
- `Ribbon.tsx` becomes composition-based instead of monolithic
- no functional regressions in tab switching, auth gating, or project open flow

### Current Review Notes

- `App.tsx` is now appropriately thin.
- `ProjectDetail.tsx` is now appropriately thin.
- `Ribbon.tsx` now exports from a fresh store snapshot at click time.
- `contractType` propagation has been restored through the refactored `ProjectDetail` path.

## Phase 5 - Design/Map Module Isolation [IN PROGRESS]

### Goal

Make the CAD/GIS subsystem easier to reason about without changing behavior.

### Scope

- `src/IMPLEMENT/stores/useDesignSync.ts`
- `src/IMPLEMENT/features/map/MapLayer.tsx`
- `src/IMPLEMENT/features/map/MapLayerComponents/*`
- `src/DESIGN/components/core/CADPanels/*`

### Tasks

- Create a selector/action facade around `useDesignSync`.
- Reduce direct UI dependence on deep store structure.
- Move cross-window event bridge logic out of visual components where possible.
- Split map components into explicit groups:
  - layers
  - overlays
  - controls
  - interaction tools
  - synchronization bridges

- Stabilize `DrawingExplorer` and CAD panel ownership.
- Make geometry and metadata helpers stay in pure utility modules.
- Verify that map render components do not own business workflows they should not own.

### Testing focus

- selection
- multi-select
- undo/redo
- vertex edit
- snapping
- print area sync
- FOV and DORI rendering math

### Exit Criteria

- UI components depend on stable store actions/selectors instead of ad hoc access
- map module has clearer ownership boundaries
- current design event behavior stays unchanged

### Current Status

- [ ] `src/IMPLEMENT/stores/useDesignSync.ts` is still very large
- [ ] `src/DESIGN/components/core/CADPanels/DrawingExplorer.tsx` is still very large
- [x] Vitest geometry/polyline-related tests are green
- [x] Rust topology propagation tests are green in the current release gate

## Phase 6 - Backend Bootstrap and DB Modularization [MOSTLY COMPLETED]

### Goal

Make backend entrypoints and data infrastructure maintainable without changing the public IPC surface.

### Results
- `src-tauri/src/main.rs` is now a thin entrypoint.
- bootstrap responsibilities are extracted to `src-tauri/src/IMPLEMENT/modules/bootstrap.rs`.
- `src-tauri/src/IMPLEMENT/db` is now split into:
  - `schema.rs`
  - `migrations.rs`
  - `models.rs`
  - `logic.rs`
- `cargo check --manifest-path src-tauri/Cargo.toml` is green.
- `cargo test --manifest-path src-tauri/Cargo.toml` is green.

### Scope

- `src-tauri/src/main.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/IMPLEMENT/commands/*`
- `src-tauri/src/IMPLEMENT/db/mod.rs`

### Tasks

- Make `main.rs` a thin composition root [x] (Already thin: design_core::run())
- Extract bootstrap responsibilities into dedicated modules [x] (Implemented in `modules/bootstrap.rs`)

- Decide and document the exact role of `lib.rs`:
  - re-export layer only
  - or mobile entry only
  - but not a second divergent desktop bootstrap path

- Split `db/mod.rs` into focused modules:
  - `connection.rs`
  - `schema.rs`
  - `migrations.rs`
  - `repositories.rs` or targeted query helpers

- Keep commands thin:
  - validate inputs
  - call domain/service layer
  - serialize outputs
  - avoid mixing schema logic, IO logic, and command plumbing in one file

### Exit Criteria

- `main.rs` is small and easy to audit
- `lib.rs` no longer creates architecture drift
- DB code is split by responsibility
- `cargo check --manifest-path src-tauri/Cargo.toml` remains green

### Current Status

- [x] thin `main.rs`
- [x] extracted bootstrap module
- [x] DB modularization started and is visible in the tree
- [x] `cargo test` is now a green gate
- [ ] command registration is still large in `lib.rs`

## Phase 7 - Documentation and Contract Alignment [COMPLETED]

### Goal

Bring architecture documents in line with the codebase after refactor.

### Tasks

- Update architecture docs that still reference old paths.
- Update code walkthrough docs to match real entrypoints:
  - `src/HOME/main.tsx`
  - `src/HOME/App.tsx`
  - canonical hook/store locations

- Add a short layering guide:
  - what belongs in `HOME`
  - what belongs in `DESIGN`
  - what belongs in `IMPLEMENT/features`
  - what belongs in `TOOL/utils`
  - what belongs in Rust `commands` vs `modules`

- Add a contract note documenting frozen IPC and event names.

### Exit Criteria

- docs describe the actual repo layout
- onboarding docs no longer point to old file paths

### Current Status

- [x] `docs/CORE_APP_CODE_WALKTHROUGH.md` now documents canonical runtime ownership
- [x] legacy-to-canonical path mapping is recorded at the top of the walkthrough for migration clarity
- [x] auxiliary planning docs under `docs/` have been updated to current canonical paths where they referenced legacy runtime locations

## Phase 8 - Release Gate and Hardening [PARTIALLY COMPLETED]

### Goal

Finish the refactor only when all critical flows are verified.

### Verification Commands

- `npm run build`
- `npm run test`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`

### Manual Verification Matrix

- app launches cleanly
- main window shows after auth/bootstrap
- `.pmp` open-by-association works
- recent projects load correctly
- switching from `HOME` to `DESIGN` works
- `analysis` window works
- `print` window works
- `streetview` window works
- import flow works
- export flow works
- metadata update event still refreshes views
- design state load, edit, undo, redo still work

### Exit Criteria

- all verification commands are green
- smoke checklist is green
- no public contract change is required to run the current product

### Current Blockers

- manual smoke checklist has not been attached to the plan as completed evidence
- multi-window GUI flows (`analysis`, `print`, `streetview`) still require manual verification in a live app session

## 10. Recommended PR Sequence

Recommended pull request order:

1. PR-1: Baseline logs + compile stabilization
2. PR-2: Import/path normalization
3. PR-3: Duplicate module convergence
4. PR-4: `App.tsx` and `ProjectDetail.tsx` decomposition
5. PR-5: Design/map subsystem isolation
6. PR-6: Rust bootstrap and DB modularization
7. PR-7: Docs alignment + final release gate

Do not merge multiple high-blast-radius phases into one PR.

## 11. Risk Register

| Risk | Impact | Likelihood | Mitigation |
| --- | --- | --- | --- |
| Fixing build errors changes runtime behavior | High | Medium | Limit Phase 1 to syntax/path repair and run smoke tests after each batch |
| Duplicate modules hide different behavior | High | High | Do not delete duplicates before importer audit and runtime comparison |
| Ghost imports indicate unfinished refactor branches | High | High | Normalize paths before deeper decomposition |
| Cross-window events break silently | High | Medium | Freeze event names and verify `analysis`/`print`/`streetview` windows manually |
| Backend bootstrap drift between `main.rs` and `lib.rs` | Medium | Medium | Consolidate builder ownership in one documented entry path |
| DB refactor accidentally changes schema behavior | High | Low | Treat DB changes as structural only, no schema mutation in this plan |
| AI optional flows break in non-AI builds | Medium | Medium | Keep feature guards intact and verify default build path first |

## 12. Success Metrics

The refactor is considered complete only if all of the following are true:

- frontend build is green
- backend check is green
- no ghost imports remain
- no duplicate runtime module trees remain for the same feature
- key orchestration files are split by concern
- `main.rs` is thin and auditable
- docs match the real architecture
- smoke-tested user flows still work without feature loss

## 13. Definition of Done

The refactor is done when:

1. The app still behaves the same from the user's point of view.
2. The frontend and backend both pass their verification gates.
3. The module layout is coherent and documented.
4. Legacy duplicate code is removed or intentionally retained with explicit compatibility shims.
5. The next engineer can identify ownership boundaries without reverse engineering the repo.
