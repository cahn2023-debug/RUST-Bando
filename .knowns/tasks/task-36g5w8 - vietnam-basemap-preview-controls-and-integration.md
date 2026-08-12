---
id: 36g5w8
title: "[vietnam-basemap-preview-controls-and-integration-03] External extent ingestion, localhost HTTP/IPC, watcher, and geolocation"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-controls-and-integration
  - spec-date:2026-08-12
createdAt: '2026-08-12T04:44:25.929Z'
updatedAt: '2026-08-12T05:58:26.691Z'
completedAt: '2026-08-12T05:30:49.339Z'
timeSpent: 931
assignee: '@me'
spec: specs/2026-08-12/vietnam-basemap-preview-controls-and-integration
fulfills:
  - AC-3
  - AC-4
  - AC-5
  - AC-6
  - AC-7
  - AC-11
  - AC-12
order: 30
---
# [vietnam-basemap-preview-controls-and-integration-03] External extent ingestion, localhost HTTP/IPC, watcher, and geolocation

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Xây payload chuẩn hóa và các nguồn nhận dữ liệu từ localhost HTTP API, Tauri IPC và thư mục theo dõi; thêm auto zoom mặc định bật/tắt được và định vị thiết bị với marker.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Shared normalized payload adapter for HTTP and IPC.
- [x] #2 Loopback HTTP server with configurable port and diagnostics.
- [x] #3 Folder watcher accepts valid object files and rejects invalid ones safely.
- [x] #4 Auto zoom defaults on and can be disabled.
- [x] #5 Geolocation success/failure behavior is tested.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Thêm normalized extent payload, validator và ingestion state; mọi nguồn HTTP/IPC/file dùng chung parser và getPreviewExtent.
2. Thêm Tauri localhost HTTP listener trên loopback với cổng user config, Tauri IPC command nhận payload và event bridge về frontend; trả diagnostics cho payload lỗi.
3. Thêm polling watcher thư mục cấu hình qua Tauri commands, nhận file JSON/GeoJSON hợp lệ và bỏ qua file lỗi không làm đổi viewport.
4. Nối BasemapPreviewApp với latest payload, autoZoom mặc định bật/có thể tắt, nút Zoom extend dùng payload mới nhất, hiển thị diagnostic.
5. Mở rộng MapCanvas controller cho external extent và geolocation marker/fly; thêm nút Định vị và xử lý permission/error giữ viewport.
6. Bổ sung test validator/transport normalization/watcher parsing/geolocation guard; chạy typecheck, Vitest, Cargo fmt/check/test phù hợp, build và validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan check: AC-3/AC-4/AC-5/AC-6/AC-7/AC-12 covered. Shared App/MapCanvas/Tauri contract requires sequential execution.
Review: PASS. No P1/P2 findings. Artifact verification: normalized extent payload, native localhost HTTP server, Tauri IPC command, folder watcher, integration status, geolocation helper, MapCanvas device marker/controller, and App settings are substantive and wired. Security checks: HTTP binds only 127.0.0.1, body capped at 4 MiB, package/path boundaries unchanged, invalid payloads rejected before event emission, watcher only accepts json/geojson. Verification passed: cargo fmt --check; cargo check --manifest-path vietnam-basemap-preview/src-tauri/Cargo.toml; cargo test --manifest-path vietnam-basemap-preview/src-tauri/Cargo.toml (5/5); npm exec tsc -p vietnam-basemap-preview/tsconfig.json --noEmit; npm exec vitest run --config vietnam-basemap-preview/vitest.config.ts (6 files, 17 tests); npm run build --prefix vietnam-basemap-preview; git diff --check. Build has only existing MapLibre chunk-size warning. System Decision Impact: none — integration remains localhost/read-only standalone preview and does not alter production basemap contract. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.
Knowns metadata repair: Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.

System Decision Impact: none — no durable guidance or production contract changed.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.

Spec Decision Compliance: D20=pass

Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass
<!-- SECTION:NOTES:END -->

