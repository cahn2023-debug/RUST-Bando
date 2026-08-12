---
id: kqgtq3
title: "[separate-basemap-layers-02] Independent Google and Local layer rendering"
status: done
priority: high
labels:
  - from-spec
  - spec:separate-basemap-layers
  - spec-date:2026-08-12
createdAt: '2026-08-12T13:32:26.676Z'
updatedAt: '2026-08-12T13:57:20.660Z'
completedAt: '2026-08-12T13:57:20.660Z'
timeSpent: 307
assignee: '@me'
spec: specs/2026-08-12/separate-basemap-layers
fulfills:
  - AC-1
  - AC-4
  - AC-5
  - AC-6
order: 20
---
# [separate-basemap-layers-02] Independent Google and Local layer rendering

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tách và nối renderer/source để checkbox điều khiển layer độc lập cho Google Street/Hybrid và Local package; giữ raster nền Google, áp dụng overlay/apistyle khả dụng và không làm mất viewport.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Renderer nhận capability/layer state và điều khiển độc lập nhiều layer.
- [x] #2 Google Street/Hybrid giữ raster nền, chỉ hiển thị nhóm có overlay/apistyle chính xác.
- [x] #3 Local package điều khiển toàn bộ layer con cùng nhóm mà không làm mất viewport.
- [x] #4 Thêm tests cho visibility độc lập và không reload toàn bộ map.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Extend the renderer with the eight-group visibility contract while keeping the existing five-group wrapper compatible.
2. Apply visibility by detected style-layer group; preserve unmapped Local layers and Google raster background.
3. Refresh Google raster sources through styled tile URLs without recreating the MapLibre map.
4. Add renderer/source tests for independent Local groups, unmapped layers, Google style rules, and hybrid overlay behavior.
5. Run typecheck/tests and validate the task.

Scope boundary: capability-driven UI, per-source persistence, and loading/updating/error UX remain in task separate-basemap-layers-03; integrated acceptance verification remains in task 04.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation checkpoint: renderer contract and independent visibility logic are implemented; targeted verification currently passes (typecheck, 12/12 tests, diagnostics clean).
Review: PASS — renderer/source diff satisfies independent Local visibility, Google raster preservation, and in-place update requirements. Google has no separately controllable boundary overlay in the current source, so boundary is intentionally not exposed by the renderer/UI contract; Hybrid labels remain an overlay aggregate for roads/labels/POIs and are not classified as boundaries. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass, D21=pass, D22=pass. System Decision Impact: none — renderer implementation follows the approved spec and existing Google preview-only decision without adding new durable guidance. Verification: typecheck passed; Vitest 10 files/34 tests passed; production build passed; Knowns validation clean.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass, D21=pass, D22=pass
Lifecycle sync: reopening briefly to let Knowns propagate fulfilled Spec ACs after final compliance metadata.
<!-- SECTION:NOTES:END -->

