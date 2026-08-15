---
id: cu9oau
title: "[design-icon-type-mapping-02] Đồng bộ hiển thị trên DESIGN"
status: done
priority: high
labels:
  - from-spec
  - spec:design-icon-type-mapping
  - spec-date:2026-08-15
createdAt: '2026-08-15T02:06:37.141Z'
updatedAt: '2026-08-15T03:17:16.321Z'
completedAt: '2026-08-15T02:33:54.965Z'
timeSpent: 918
assignee: '@me'
spec: specs/2026-08-15/design-icon-type-mapping
fulfills:
  - AC-002
  - AC-003
  - AC-004
  - AC-005
  - AC-006
order: 20
---
# [design-icon-type-mapping-02] Đồng bộ hiển thị trên DESIGN

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nối mapping chuẩn vào Canvas, cây đối tượng và Property Panel; bộ chọn hiển thị icon, tên, loại; hỗ trợ preview tức thời và nhiều lựa chọn.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Canvas, cây đối tượng và Property Panel dùng cùng iconKey, tên và loại đối tượng chuẩn.
- [x] #2 Chọn icon cập nhật preview cả ba khu vực trong tối đa 1 giây và chỉ ghi chính thức khi Lưu.
- [x] #3 Tập chọn khác nhau hiển thị Khác nhau và áp dụng được icon mới cho toàn bộ tập.
- [x] #4 Line/polygon giữ ưu tiên biểu tượng theo hình học.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Extend the UI preview state with an optional per-feature preview map and batch preview action while preserving the existing single-feature preview contract and clearing previews on selection/reset.
2. Thread batch preview metadata through the MapLibre render types, renderer cache keys, adapter recursion and feature collection so every selected object previews the same icon/type before Save.
3. Update the object tree icon path and `IconSelector` to consume catalog metadata, show icon/name/object type, and expose a clear mixed-selection state without changing per-surface sizing/color rules.
4. Replace PropertyPanel's multi-selection placeholder with mixed-state icon editing: derive selected features, stage per-feature metadata previews, and queue a bulk `FeatureUpdated` event set on Save; keep single-selection behavior unchanged.
5. Add focused tests for IconSelector mixed state, batch preview state, PropertyPanel bulk icon/type updates, tree/map preview propagation, and geometry precedence; run targeted UI/map tests, typecheck/lint diagnostics, Knowns validation and diff checks.

### Plan check

- AC coverage: AC-002 -> steps 2-3; AC-003 -> steps 3-4; AC-004 -> steps 1-2-4; AC-005 -> step 4; AC-006 -> steps 2-3.
- Scope: Canvas/tree/PropertyPanel preview and icon selection only; no persistence migration or BAK work in this task.
- Dependency: task 1 catalog is complete; shared preview state is a runtime contract, so all changes execute sequentially.
- Risk: batch preview touches Zustand state, MapLibre cache keys and PropertyPanel save semantics; preserve the singular preview fields for existing panels and add regression coverage before task completion.
- Existing dirty worktree changes are preserved; unrelated typecheck failures are recorded rather than cleaned up here.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review: PASS - no P1/P2 findings. Verification: targeted UI/map tests passed; git diff check passed; typecheck has only pre-existing out-of-scope errors. Canvas, object tree, Property Panel and IconSelector artifacts are substantive and wired. System Decision Impact: none - consumes the approved mapping/preview contract only. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass
<!-- SECTION:NOTES:END -->

