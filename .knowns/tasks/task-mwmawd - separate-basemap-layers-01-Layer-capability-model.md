---
id: mwmawd
title: "[separate-basemap-layers-01] Layer capability model and Local package mapping"
status: done
priority: high
labels:
  - from-spec
  - spec:separate-basemap-layers
  - spec-date:2026-08-12
createdAt: '2026-08-12T13:32:26.531Z'
updatedAt: '2026-08-12T13:57:19.404Z'
completedAt: '2026-08-12T13:57:19.404Z'
timeSpent: 200
assignee: '@me'
spec: specs/2026-08-12/separate-basemap-layers
fulfills:
  - AC-2
  - AC-3
  - AC-8
order: 10
---
# [separate-basemap-layers-01] Layer capability model and Local package mapping

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Xây dựng contract/capability model cho layer độc lập; phát hiện các nhóm layer khả dụng theo source-layer/ID chuẩn của Local package, giữ layer không khớp hiển thị mặc định và tạo danh sách theo thứ tự cố định.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Định nghĩa contract các nhóm layer theo thứ tự cố định và capability theo source.
- [x] #2 Phân loại Local package theo source-layer/ID chuẩn; nhóm không có dữ liệu không xuất hiện.
- [x] #3 Giữ layer không khớp mapping hiển thị mặc định và không có checkbox.
- [x] #4 Thêm unit tests cho mapping, thứ tự và trạng thái mặc định.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Add a typed basemap layer catalog with the eight fixed groups, labels, order, and default state semantics.
2. Add Local package style capability detection using source-layer/ID mappings; return available groups, mapped child layer IDs, and unmapped layer IDs.
3. Add unit tests covering fixed ordering, missing groups, standard mappings, and unmapped custom layers.
4. Run typecheck/tests and validate the task.

Scope boundary: renderer wiring, Google source splitting, UI persistence, and loading/error states remain in tasks separate-basemap-layers-02/03/04.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review: PASS — no P1/P2 findings. Implemented basemapLayers.ts and basemapLayers.test.ts; renderer/UI integration intentionally remains in later wave tasks. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass, D21=pass, D22=pass. System Decision Impact: candidate @decision/20260812-2035-basemap-preview-uses-fixed-layer-capability-groups (added) — adds stable layer capability catalog and source-layer/ID mapping contract. Verification: typecheck passed; targeted tests 7/7 passed; diagnostics clean; git diff --check clean.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass, D21=pass, D22=pass
Lifecycle sync: reopening briefly to let Knowns propagate fulfilled Spec ACs after final compliance metadata.
<!-- SECTION:NOTES:END -->

