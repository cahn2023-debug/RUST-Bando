---
id: aqthf6
title: "[active-code-workspace-standardization-03] Migrate Project Manager to canonical app path"
status: done
priority: high
labels:
  - from-spec
  - spec:active-code-workspace-standardization
  - spec-date:2026-08-14
createdAt: '2026-08-14T07:47:45.759Z'
updatedAt: '2026-08-14T08:54:24.653Z'
completedAt: '2026-08-14T07:59:09.264Z'
timeSpent: 212
assignee: '@me'
spec: specs/2026-08-14/active-code-workspace-standardization
---
# [active-code-workspace-standardization-03] Migrate Project Manager to canonical app path

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move the verified Project Manager source tree into apps/project-manager with Git-aware operations, preserve working-tree changes, and update only its internal paths/configuration needed for the new location.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The verified Project Manager source tree is moved without destructive Git operations.
- [x] #2 Internal imports, manifests, and build configuration resolve from apps/project-manager.
- [x] #3 The old path is no longer an active entrypoint and is retained only as allowed archive/rollback state.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Freeze and verify the source/target boundary: source is the inventory-verified BAK legacy-application tree, target is the empty in-repo `apps/project-manager`, and both resolve inside the workspace.
2. Build an in-memory source file list with SHA-256 hashes, including app source/config/scripts/resources and `src-tauri/.cargo`, while excluding nested dependencies, dist, Tauri target/gen, nested BAK, and planning metadata `.brain`.
3. Move included top-level app files/directories and included `src-tauri` children to `apps/project-manager` with `Move-Item` because the ignored BAK source is not Git-tracked; do not delete or overwrite any target path.
4. Write the per-file source/target hash manifest to `data/manifests/project-manager-migration-2026-08-14.json`, then verify every moved file hash and ensure excluded/generated material remains at the old archive path.
5. Scan the new app tree for active legacy-application path references; update only internal runtime/config references required by the move, leaving historical manual script paths recorded for later review rather than rewriting unrelated utilities.
6. Run `npm --prefix apps/project-manager run typecheck` if dependencies resolve from the root, otherwise record the environment blocker for task 05; validate the task and append Spec Decision Compliance D1–D12 plus `System Decision Impact: none`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Moved 642 active Project Manager files from the verified ignored BAK source into apps/project-manager. The source was not Git-tracked, so git mv was unavailable; the filesystem move was guarded by workspace boundary checks, empty target checks, hash capture, and automatic rollback on error. Excluded node_modules, dist, src-tauri/target, src-tauri/gen, src-tauri/BAK, and src-tauri/.brain remained in the old archive path.

Manifest: data/manifests/project-manager-migration-2026-08-14.json. Verification: 642 planned, 642 hash matches, 0 failures; old package.json/entrypoints absent; no active legacy-application references; npm --prefix apps/project-manager run typecheck passed.
System Decision Impact: none — this applies the approved workspace migration and does not add guidance beyond the spec/candidate source decision.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass.
Review: PASS. No P1/P2 findings. Migration manifest has 642/642 hash matches; target has no reparse points; old active package/index/src are absent while excluded dependency/generated/archive paths remain; no active legacy references found.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
<!-- SECTION:NOTES:END -->

