---
id: hviomg
title: "[vietnam-basemap-preview-controls-and-integration-01] Viewport controls and map interaction foundation"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-controls-and-integration
  - spec-date:2026-08-12
createdAt: '2026-08-12T04:44:25.712Z'
updatedAt: '2026-08-12T05:58:22.429Z'
completedAt: '2026-08-12T04:50:37.090Z'
timeSpent: 338
assignee: '@me'
spec: specs/2026-08-12/vietnam-basemap-preview-controls-and-integration
fulfills:
  - AC-1
  - AC-2
order: 10
---
# [vietnam-basemap-preview-controls-and-integration-01] Viewport controls and map interaction foundation

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bổ sung controller và UI cho Zoom +, Zoom -, Zoom extend, chọn điểm trên bản đồ, marker/Pegman foundation và hiển thị trạng thái dữ liệu chờ. Zoom extend chỉ fit extent của đối tượng hiện tại, không tạo overlay.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 MapCanvas expose typed zoom/fit/click controller.
- [x] #2 Toolbar có Zoom +, Zoom -, Zoom extend và empty-state rõ ràng.
- [x] #3 Unit/integration tests cho controller và extent.
- [x] #4 fitDataExtent chỉ gọi viewport fit, không tạo source/layer/overlay.
- [x] #5 Extent utility xử lý point, line, polygon, Feature và FeatureCollection; input lỗi trả null.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Thêm kiểu dữ liệu điểm/extent và utility tính extent từ geometry, Feature, FeatureCollection hoặc coordinate tree.
2. Mở rộng MapCanvas controller với fitDataExtent(data), xử lý map click và callback điểm được chọn; giữ reset/zoom hiện tại.
3. Nối BasemapPreviewApp với latest extent data/selected point và hiển thị các nút Zoom +, Zoom -, Zoom extend cùng trạng thái chưa có dữ liệu.
4. Thêm test cho extent point/line/polygon/FeatureCollection và input không hợp lệ.
5. Chạy typecheck/build/test standalone preview, validate task và ghi compliance D1-D20.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan check: AC-1/AC-2/AC-3 covered. Shared runtime risk is isolated to MapCanvas/App contract; execution remains sequential per kn-flow.
Review: PASS. No P1/P2 findings. Artifact verification: extent utility and MapCanvas controller exist, are substantive, and are wired into BasemapPreviewApp. Verification passed: npm exec tsc -p vietnam-basemap-preview/tsconfig.json --noEmit; npm exec vitest run --config vietnam-basemap-preview/vitest.config.ts (3 files, 8 tests); npm run build --prefix vietnam-basemap-preview; git diff --check. Build has only existing chunk-size warning. AC mapping: task fulfills AC-1 and AC-2; AC-3 is intentionally assigned to task 36g5w8 for external ingestion coverage. System Decision Impact: none — this task only adds standalone preview viewport interaction and does not change durable platform guidance or production contracts. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.
Knowns metadata repair: Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.

System Decision Impact: none — no durable guidance or production contract changed.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.

Spec Decision Compliance: D20=pass

Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass
<!-- SECTION:NOTES:END -->

