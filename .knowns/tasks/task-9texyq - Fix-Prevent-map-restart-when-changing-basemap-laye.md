---
id: 9texyq
title: 'Fix: Prevent map restart when changing basemap layer'
status: done
priority: high
labels:
  - bugfix
  - basemap-preview
  - map-lifecycle
  - runtime
createdAt: '2026-08-12T14:40:31.373Z'
updatedAt: '2026-08-12T14:47:15.846Z'
completedAt: '2026-08-12T14:47:15.846Z'
timeSpent: 0
assignee: '@me'
spec: specs/2026-08-12/separate-basemap-layers
fulfills:
  - AC-1
  - AC-2
---
# Fix: Prevent map restart when changing basemap layer

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Đổi Google Street/Hybrid/Local layer đang làm MapCanvas unmount và khởi tạo lại, khiến bản đồ/phần mềm trông như restart. Giữ MapLibre instance, camera, controller và chỉ thay style/source khi đổi layer hoặc style.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Đổi Google Street, Google Hybrid hoặc Local package không làm unmount/recreate MapCanvas; MapLibre instance và cửa sổ ứng dụng vẫn giữ nguyên.
- [x] #2 Camera center/zoom/bearing/pitch được giữ khi đổi basemap/style.
- [x] #3 Cấu hình runtime không ghi vào source tree hoặc kích hoạt Tauri dev watcher restart.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Debug classification: runtime/UI lifecycle. Root cause: BasemapPreviewApp used a MapCanvas key containing layer/style and setAdapter(null) during source loading; MapCanvas cleanup called map.remove(), so each layer change destroyed and recreated MapLibre. In tauri dev, save_preview_user_config also wrote basemap-preview.config.json in the source tree watched by the dev runner, which could restart the app. Fix: removed the remount key and adapter nulling; MapCanvas now keeps one MapLibre instance, uses setStyle with the current center/zoom/bearing/pitch, keeps controller/callback refs, and re-registers only the Local protocol when needed. Runtime user config now writes under %LOCALAPPDATA%/Vietnam Basemap Preview, with the project config retained only as launch/fallback config. Verification: root npm run check passed; 43 Vitest tests, workspace Rust tests, 7 Tauri tests, typecheck, build, cargo fmt/check and smoke verifier passed.
<!-- SECTION:NOTES:END -->

