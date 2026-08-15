---
id: zfg8zs
title: "[design-icon-type-mapping-03] Migration dữ liệu và fallback icon"
status: done
priority: high
labels:
  - from-spec
  - spec:design-icon-type-mapping
  - spec-date:2026-08-15
createdAt: '2026-08-15T02:06:45.169Z'
updatedAt: '2026-08-15T03:17:17.310Z'
completedAt: '2026-08-15T02:54:57.253Z'
timeSpent: 972
assignee: '@me'
spec: specs/2026-08-15/design-icon-type-mapping
fulfills:
  - AC-007
  - AC-008
  - AC-009
order: 30
---
# [design-icon-type-mapping-03] Migration dữ liệu và fallback icon

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Chuẩn hóa dữ liệu cũ sang bộ trường chuẩn, tạo snapshot BAK có phiên bản cho bản ghi bị ảnh hưởng, hỗ trợ khôi phục, fallback và cảnh báo cho loại chưa ánh xạ.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Bản ghi bị ảnh hưởng được snapshot vào BAK trước migration; bản ghi không bị ảnh hưởng không bị snapshot.
- [x] #2 Snapshot hợp lệ có thể khôi phục ít nhất một bản ghi về trạng thái trước migration.
- [x] #3 Loại chưa ánh xạ vẫn hiển thị bằng icon mặc định, giữ nhãn/loại, có tooltip cảnh báo và có thể chuyển sang mapping hợp lệ.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Add a pure icon-mapping migration planner in the existing persistence/display utilities. It will normalize icon/type/objectType for point/device features, preserve geometry precedence for line/polygon, retain unknown labels/types with a default icon and an explicit unmapped warning, and return only changed records plus FeatureUpdated payloads.
2. Add versioned BAK snapshot/restore helpers using the existing Tauri binary file API. Write snapshots beside the project file under BAK/design-icon-type-mapping/<project-id>/ before any active event is dispatched; include complete affected feature records, validate snapshot schema/project identity, and restore via the existing event pipeline.
3. Integrate the planner into project initialization after raw bootstrap/hydration data is available but before canonical display normalization is committed. If snapshot creation fails, abort the migration without dispatching update events; if there are no affected records, do not create a snapshot.
4. Add unmapped warning presentation to the object tree and Property Panel while keeping editing/save available; remove the warning after selecting and saving a valid catalog icon.
5. Add unit/integration tests for affected-only snapshots, no-op migrations, alias/type/objectType normalization, line/polygon precedence, unknown fallback/warning, snapshot validation/restore, and initialization failure safety. Run targeted frontend tests, typecheck diagnostics, Knowns validation, diff checks, then review.

### Plan check

- AC coverage: AC-007 -> steps 1-3; AC-008 -> step 2; AC-009 -> steps 1 and 4; existing catalog/preview work remains covered by tasks 1-2.
- Scope: migration/fallback only; no new icon types, no 3D work, no changes to unrelated BAK archives.
- Dependency: task 1 catalog and task 2 preview/persistence contracts are complete; implementation is sequential because initialization and active event writes share the runtime contract.
- Risk: snapshot I/O and startup migration are data-sensitive. The write gate is snapshot success; existing project path must be available for affected records, otherwise no active update is dispatched.
- Review gate: verify only affected feature ids appear in each versioned BAK snapshot and restoring one record reproduces its pre-migration mapping fields.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review: PASS - no P1/P2 findings. Verification: migration/snapshot/UI/map tests passed; production build passed; targeted ESLint had 0 errors; git diff check passed; typecheck has only pre-existing out-of-scope errors. Snapshot failure aborts active events. System Decision Impact: none - follows approved mapping and existing event/file contracts only. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass
<!-- SECTION:NOTES:END -->

