---
id: ldoyga
title: 'Fix: Basemap tile proxy connection refused and slow loading'
status: done
priority: high
labels:
  - bugfix
  - basemap-preview
  - performance
  - runtime
createdAt: '2026-08-12T14:36:56.893Z'
updatedAt: '2026-08-12T14:37:07.448Z'
completedAt: '2026-08-12T14:36:56.893Z'
timeSpent: 0
assignee: '@me'
spec: specs/2026-08-12/separate-basemap-layers
fulfills:
  - AC-1
  - AC-2
  - AC-3
---
# Fix: Basemap tile proxy connection refused and slow loading

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sau khi tách layer, Google tile preview báo ERR_CONNECTION_REFUSED tại localhost và load chậm do proxy xử lý tuần tự. Sửa endpoint theo môi trường, đảm bảo port runtime được công bố, tối ưu proxy concurrency/client pooling, và loại bỏ favicon 404.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: dev frontend used the Tauri-only localhost port, while the Tauri listener handled blocking tile requests serially. Fix: dev uses Vite-relative proxy; packaged Tauri uses the actual bound port with ephemeral fallback; proxy handles connections concurrently and reuses a pooled reqwest client; default raster tiles are not reset unnecessarily; favicon.svg removes the 404. Verification: root npm run check passed; 43 Vitest tests, 7 Tauri tests, workspace Rust tests, typecheck, build, cargo fmt/check, and smoke verifier passed. Live Vite endpoint returned HTTP 200 image/png.
<!-- SECTION:NOTES:END -->

