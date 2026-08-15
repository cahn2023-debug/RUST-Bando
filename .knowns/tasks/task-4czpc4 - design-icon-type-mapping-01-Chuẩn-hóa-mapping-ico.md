---
id: 4czpc4
title: "[design-icon-type-mapping-01] Chuẩn hóa mapping icon và object type"
status: done
priority: high
labels:
  - from-spec
  - spec:design-icon-type-mapping
  - spec-date:2026-08-15
createdAt: '2026-08-15T02:06:22.180Z'
updatedAt: '2026-08-15T03:17:15.291Z'
completedAt: '2026-08-15T02:16:15.440Z'
timeSpent: 495
assignee: '@me'
spec: specs/2026-08-15/design-icon-type-mapping
fulfills:
  - AC-001
  - AC-006
  - AC-010
order: 10
---
# [design-icon-type-mapping-01] Chuẩn hóa mapping icon và object type

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hợp nhất mapping iconKey, tên hiển thị và object type cho toàn bộ loại hiện có; loại bỏ các định nghĩa và logic trùng trong DESIGN và utility trực tiếp liên quan.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Một mapping chuẩn duy nhất trả về iconKey, tên hiển thị và object type cho toàn bộ loại hiện có.
- [x] #2 Các logic chuẩn hóa, chọn và hiển thị icon-type dùng chung contract và không còn nguồn mapping trùng.
- [x] #3 Ma trận test mapping và regression tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Inventory the current icon/type contracts and all direct consumers using CodeGraph plus the existing icon/display/persistence tests; freeze the supported type set from the current manifest and contract.
2. Establish one canonical mapping for icon key, display label, object type, geometry behavior and icon component metadata, then route normalization and type resolution through it without changing per-feature color or size behavior.
3. Remove duplicate mapping/SVG rule definitions from the direct DESIGN/tool paths while preserving compatibility exports for existing callers; keep MapIcons as the single SVG implementation and make any compatibility module delegate to it.
4. Add or update focused tests for every supported type, legacy aliases, fallback behavior, geometry precedence, selector options and SVG output; assert that the canonical mapping is the only source used by the affected paths.
5. Run targeted icon/display/persistence tests, project-manager typecheck/lint where available, Knowns validation, and git diff checks; record AC status and review notes.

### Plan check

- AC coverage: AC-001 -> steps 1-2; AC-006 -> steps 2-3; AC-010 -> steps 4-5.
- Scope: canonical mapping and direct consumers only; no migration, BAK snapshot, multi-select UI, or unrelated cleanup in this task.
- Dependency: task 1 is the contract foundation for task 2 and task 3; execution remains sequential.
- Risk: changing normalization affects map SVG, MapLibre properties, PropertyPanel persistence, and tree display; targeted regression tests are mandatory before proceeding.
- Existing dirty worktree changes are preserved; only lines required by this task may be changed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review: PASS - no P1/P2 findings. Verification: targeted icon/display/persistence/MapLibre/SVG tests passed; git diff check passed; typecheck has only pre-existing out-of-scope errors. System Decision Impact: none - approved spec-scoped mapping only. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass
<!-- SECTION:NOTES:END -->

