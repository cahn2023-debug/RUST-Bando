---
id: cso903
title: "[vietnam-basemap-preview-workspace-consolidation-03] Rewire standalone build scripts and documentation"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-workspace-consolidation
  - spec-date:2026-08-12
createdAt: '2026-08-12T10:40:34.657Z'
updatedAt: '2026-08-12T11:07:57.327Z'
completedAt: '2026-08-12T11:07:42.933Z'
timeSpent: 0
assignee: '@me'
spec: specs/2026-08-12/vietnam-basemap-preview-workspace-consolidation
fulfills:
  - AC-3
  - AC-4
  - AC-8
order: 30
---
# [vietnam-basemap-preview-workspace-consolidation-03] Rewire standalone build scripts and documentation

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cập nhật npm scripts, Vite/Tauri/Cargo paths, debug/verification scripts và README để workspace mới build/test độc lập.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Make npm scripts invoke preview workspace commands from its own directory.
- [x] #2 Update debug/verification scripts to use the merged workspace and artifact paths without old workspace references.
- [x] #3 Merge platform README content into the preview workspace README and document standalone frontend/platform checks, artifact layout, and BAK rollback.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect preview package/config, root npm scripts, debug/verification scripts and both README documents for stale root/old-workspace assumptions.
2. Add workspace-local scripts for frontend build/test, Cargo workspace checks, and combined verification; make root convenience scripts delegate to the workspace without changing unrelated application scripts.
3. Update debug and verification scripts to resolve the workspace-local paths and artifact locations after the merge.
4. Replace the temporary platform README copy with a merged workspace README that documents platform ownership, release contract, preview operation, checks, artifacts and BAK rollback.
5. Run targeted typecheck/tests/build and text-reference checks, then validate the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewired workspace-local package scripts, lockfile/dependencies, Vite envDir, Cargo platform exclusion, debug/verify scripts, root wrapper package and README. Verification passed: workspace npm run check; root npm run check; root debug build produced dist/basemap-preview-debug/vietnam-basemap-preview.exe (14,949,376 bytes) and vietnam-basemap-preview.pdb (114,348,032 bytes); root smoke verify passed; git diff --check passed with only pre-existing docs graph CRLF warning. Self-review: PASS, no P1/P2 findings; delegated reviewer timed out before verdict. System Decision Impact: none — operational rewiring/documentation does not change durable guidance or runtime contracts. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass
<!-- SECTION:NOTES:END -->

