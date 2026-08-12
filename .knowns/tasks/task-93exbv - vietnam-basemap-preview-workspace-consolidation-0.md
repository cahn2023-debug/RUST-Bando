---
id: 93exbv
title: "[vietnam-basemap-preview-workspace-consolidation-01] Snapshot legacy application into BAK"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-workspace-consolidation
  - spec-date:2026-08-12
createdAt: '2026-08-12T10:40:34.591Z'
updatedAt: '2026-08-12T11:07:56.124Z'
completedAt: '2026-08-12T11:07:42.355Z'
timeSpent: 0
assignee: '@me'
spec: specs/2026-08-12/vietnam-basemap-preview-workspace-consolidation
fulfills:
  - AC-5
order: 10
---
# [vietnam-basemap-preview-workspace-consolidation-01] Snapshot legacy application into BAK

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tạo snapshot riêng trong BAK cho code ứng dụng cũ trước khi thay đổi active workspace; giữ cấu trúc đủ để đối chiếu và khôi phục.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Snapshot active legacy application source and required root configuration into a new timestamped BAK archive.
- [x] #2 Include a manifest with relative paths and hashes for rollback/audit.
- [x] #3 Verify snapshot completeness before any active source is removed.
- [x] #4 Move the verified legacy frontend/backend code from active root paths into the BAK archive, excluding generated build/runtime data.
- [x] #5 Verify active root no longer contains legacy application source directories while the BAK archive retains the code and manifest.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory the active legacy application boundary without touching existing BAK archives: src, src-tauri, public, design-system, root app manifests/configuration and root scripts used by the current application.
2. Create a new timestamped archive under BAK/archive/2026-08-12/vietnam-basemap-preview-workspace-consolidation/ and copy the identified source/configuration while excluding generated dependencies, build outputs, secrets and the basemap workspaces being migrated.
3. Generate a deterministic manifest of archived relative paths and SHA-256 hashes, then compare source/archive file counts and hashes.
4. Record the rollback location and verification evidence, validate the task, and stop before the next migration task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Snapshot completed at BAK/archive/2026-08-12/vietnam-basemap-preview-workspace-consolidation/legacy-application with manifest.json and SNAPSHOT.md. Archived 680 files (including metadata), covering 679 active source/config files with 0 missing and 0 SHA-256 mismatches; generated target/local_data/temp network databases and other excluded runtime data were not copied. Existing BAK archives were preserved. System Decision Impact: none — this task preserves rollback evidence and does not add durable project guidance or change runtime contracts. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass.
Reopened: snapshot integrity passed, but the approved user scope also requires legacy application code to leave the active root and reside in BAK. Adding the move-and-boundary step before final consolidation.
Legacy source/config/scripts moved after verified snapshot into BAK/archive/2026-08-12/vietnam-basemap-preview-workspace-consolidation/legacy-application-active; runtime/generated data moved to legacy-application-runtime and legacy-basemap-target. Root active legacy directories src, src-tauri, scripts, public, design-system and vietnam-basemap are absent. Active archive manifest records 676 files with SHA-256 hashes. Self-review: PASS, no P1/P2 findings; delegated reviewer timed out before verdict. System Decision Impact: none — archive/migration evidence does not change durable guidance or runtime contracts. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass
<!-- SECTION:NOTES:END -->

