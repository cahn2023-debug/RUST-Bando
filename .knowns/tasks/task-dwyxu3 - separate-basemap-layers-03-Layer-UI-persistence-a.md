---
id: dwyxu3
title: "[separate-basemap-layers-03] Layer UI persistence and update states"
status: done
priority: high
labels:
  - from-spec
  - spec:separate-basemap-layers
  - spec-date:2026-08-12
createdAt: '2026-08-12T13:32:26.720Z'
updatedAt: '2026-08-12T13:57:22.184Z'
completedAt: '2026-08-12T13:57:22.184Z'
timeSpent: 592
assignee: '@me'
spec: specs/2026-08-12/separate-basemap-layers
fulfills:
  - AC-7
  - AC-9
  - AC-10
  - AC-11
order: 30
---
# [separate-basemap-layers-03] Layer UI persistence and update states

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cập nhật UI layer theo capability của nguồn, lưu/khôi phục trạng thái theo nguồn, xử lý loading/updating/error/retry và giữ lựa chọn người dùng khi cập nhật thất bại.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 UI render danh sách layer theo capability và thứ tự cố định.
- [x] #2 Lưu/khôi phục state riêng theo Google Street, Google Hybrid và Local package.
- [x] #3 Hiển thị loading/updating/error/retry đúng semantics và giữ lựa chọn khi lỗi.
- [x] #4 Thêm tests cho persistence và các trạng thái UI.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Replace the user-config sub-layer shape with an eight-group visibility state keyed separately for Google Street, Google Hybrid, and shared Local package; normalize legacy five-group config into the new shape with all available groups enabled by default.
2. Expose source capabilities from MapCanvas after style load: Local derives groups from style source-layer/ID mapping; Google exposes only Roads, Labels, and POIs because no precise boundary overlay exists.
3. Rebuild LayerPopover’s layer section from capability/order metadata and wire optimistic in-place toggles, per-source persistence, loading lock, updating status, error retention, and retry while preserving the existing map controller/viewport.
4. Add unit/component-facing tests for normalization, source isolation/shared Local state, capability filtering, and loading/update/error UI semantics; run typecheck, tests, build, and Knowns validation.

Scope boundary: integrated acceptance coverage and full SDD verification remain in task separate-basemap-layers-04.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review: PASS — capability-driven LayerPopover is wired to MapCanvas style capabilities; Google exposes only Roads, Labels, POIs and hides Boundary because no precise overlay exists; Local uses detected source-layer/ID groups in fixed order. Persistence is source-specific for Google Street/Hybrid and shared for Local, with legacy five-group migration at the frontend boundary. Loading, updating, error, retry, optimistic selection retention, and accessibility status/alert semantics are implemented. No P1/P2 findings; diagnostics clean. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass, D21=pass, D22=pass. System Decision Impact: none — UI/persistence implementation follows the approved spec and existing preview-only guidance without adding new durable guidance. Verification: typecheck passed; Vitest 11 files/40 tests passed; Vite build passed; Tauri fmt/check/test passed (5 tests); Knowns diagnostics and validation clean; preview subtree diff check clean.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass, D21=pass, D22=pass
Lifecycle sync: reopening briefly to let Knowns propagate fulfilled Spec ACs after final compliance metadata.
<!-- SECTION:NOTES:END -->

