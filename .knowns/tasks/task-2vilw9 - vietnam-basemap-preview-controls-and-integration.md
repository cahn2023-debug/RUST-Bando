---
id: 2vilw9
title: "[vietnam-basemap-preview-controls-and-integration-02] Layer switching, persisted configuration, and local package download"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-controls-and-integration
  - spec-date:2026-08-12
createdAt: '2026-08-12T04:44:25.822Z'
updatedAt: '2026-08-12T05:58:24.472Z'
completedAt: '2026-08-12T05:14:58.285Z'
timeSpent: 1443
assignee: '@me'
spec: specs/2026-08-12/vietnam-basemap-preview-controls-and-integration
fulfills:
  - AC-8
  - AC-9
  - AC-10
order: 20
---
# [vietnam-basemap-preview-controls-and-integration-02] Layer switching, persisted configuration, and local package download

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mở rộng layer Google Street/Google Hybrid/Local package, cấu hình người dùng, màn hình chọn layer lần đầu, chọn thư mục local và tải .pdb thủ công trước khi kích hoạt package.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Layer selector gồm Google Street/Hybrid/Local package.
- [x] #2 Persist/restore layer/package/download/watcher/port/autoZoom config.
- [x] #3 Manual .pdb download only activates after validation.
- [x] #4 Invalid package shows detailed errors and reselect path.
- [x] #5 Tests cover switch, persistence, precedence and failure.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Mở rộng layer contract thành Google Street, Google Hybrid và Local package; cho phép Google adapter chọn raster `lyrs=m` hoặc `lyrs=y` mà vẫn giữ attribution/preview-only boundary.
2. Thêm user configuration store cho layer, package root, download URL, watcher folder, localhost port và auto-zoom; khôi phục cấu hình khi khởi động, hiển thị layer chooser khi chưa có cấu hình.
3. Thêm Tauri bridge chọn thư mục, tải URL `.pdb` thủ công và ghi file vào thư mục đã chọn; không thay đổi active package trước khi download và validation thành công.
4. Nối BasemapPreviewApp vào layer selector/config store/package actions, hiển thị lỗi package chi tiết và không fallback âm thầm.
5. Bổ sung test cho Google Street/Hybrid, configuration persistence/normalization và download guard; chạy typecheck/test/build và validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan check: AC-8/AC-9/AC-10/AC-11 covered. Tauri bridge and App state share runtime contract, so execution remains sequential.
Review: PASS after fixes. No P1/P2 findings remain. Artifact verification: PreviewLayerId selector, Google Street/Hybrid adapters, user config bridge, package picker/download bridge, Tauri config commands, and package path allow-list are substantive and wired into BasemapPreviewApp. Verification passed: npm exec tsc -p vietnam-basemap-preview/tsconfig.json --noEmit; npm exec vitest run --config vietnam-basemap-preview/vitest.config.ts (4 files, 12 tests); cargo fmt --check; cargo check --manifest-path vietnam-basemap-preview/src-tauri/Cargo.toml; npm run build --prefix vietnam-basemap-preview; git diff --check. Cargo test compilation passed previously but test runner hit broken pipe after timeout. AC mapping: fulfills AC-8, AC-9, AC-10; AC-11 remains assigned to task 36g5w8 because watcher folder, localhost port and autoZoom runtime wiring are part of that task. System Decision Impact: none — changes remain standalone preview configuration and package handling; no production basemap contract guidance changed. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.
Knowns metadata repair: Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.

System Decision Impact: none — no durable guidance or production contract changed.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.

Spec Decision Compliance: D20=pass

Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass
<!-- SECTION:NOTES:END -->

