---
id: w22s0l
title: "[vietnam-basemap-preview-workspace-consolidation-02] Merge Vietnam Basemap platform into preview workspace"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-workspace-consolidation
  - spec-date:2026-08-12
createdAt: '2026-08-12T10:40:34.438Z'
updatedAt: '2026-08-12T11:07:56.714Z'
completedAt: '2026-08-12T10:49:37.736Z'
timeSpent: 0
assignee: '@me'
spec: specs/2026-08-12/vietnam-basemap-preview-workspace-consolidation
fulfills:
  - AC-1
  - AC-2
  - AC-6
order: 20
---
# [vietnam-basemap-preview-workspace-consolidation-02] Merge Vietnam Basemap platform into preview workspace

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Di chuyển toàn bộ nội dung vietnam-basemap vào vietnam-basemap-preview, cập nhật Cargo workspace và loại bỏ workspace cũ sau khi kiểm tra đích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Move all tracked/source content from vietnam-basemap into vietnam-basemap-preview without name collisions.
- [x] #2 Preserve platform Cargo workspace, assets, builder, contracts, docs and styles under the new workspace.
- [x] #3 Remove the old active vietnam-basemap workspace only after destination completeness checks pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory tracked and generated content in both workspaces; confirm destination paths do not collide and preserve existing preview files.
2. Move platform source/configuration groups (assets, builder, contracts, crates, docs, styles, Cargo manifests, README, .gitignore) into vietnam-basemap-preview, excluding generated target artifacts.
3. Update the merged Cargo workspace path/layout only as needed so all platform crates remain local to vietnam-basemap-preview.
4. Verify every migrated source file exists at the destination with matching content, Cargo metadata resolves, and the old vietnam-basemap workspace has no active source left.
5. Record evidence and validate the task before handing off script/config rewiring.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Platform merge completed. Moved assets (7 files), builder (2), contracts (3), crates (15), docs (2), styles (3), Cargo.toml/Cargo.lock/.gitignore into vietnam-basemap-preview. Existing preview README was preserved; original platform README is temporarily retained as VIETNAM_BASEMAP_PLATFORM.md for task 3 documentation merge. Generated vietnam-basemap/target (3,650 files / ~850 MB) was moved to BAK/archive/2026-08-12/vietnam-basemap-preview-workspace-consolidation/legacy-basemap-target, then the empty old workspace was removed. cargo metadata resolves workspace root and all 5 platform crates under vietnam-basemap-preview. System Decision Impact: none — source reorganization preserves existing platform contracts and runtime behavior. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass.
Integrated self-review: PASS, no P1/P2 findings. Destination workspace contains platform source/assets/docs/config, cargo metadata resolves 5 crates under vietnam-basemap-preview, old vietnam-basemap absent, and generated target preserved under BAK. System Decision Impact: none — source reorganization preserves platform contracts and runtime behavior. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass
<!-- SECTION:NOTES:END -->

