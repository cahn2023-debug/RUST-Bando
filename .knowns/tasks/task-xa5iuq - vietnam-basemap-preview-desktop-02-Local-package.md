---
id: xa5iuq
title: "[vietnam-basemap-preview-desktop-02] Local package và Google online source adapters"
status: todo
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-desktop
  - spec-date:2026-08-11
createdAt: '2026-08-11T09:05:31.328Z'
updatedAt: '2026-08-11T09:05:45.248Z'
timeSpent: 0
spec: specs/2026-08-11/vietnam-basemap-preview-desktop
fulfills:
  - AC-2
  - AC-3
  - AC-4
  - AC-8
order: 20
---
# [vietnam-basemap-preview-desktop-02] Local package và Google online source adapters

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tích hợp local package/offline, Google raster tile template, source selector và trạng thái lỗi.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Source selector chuyển được giữa local package và online/LAN source.
- [ ] #2 Online mode dùng đúng Google raster tile template đã khóa và hiển thị external source/attribution.
- [ ] #3 Local package được validate compatibility/assets trước render; Google tile failure hiển thị lỗi và không tự fallback.
<!-- AC:END -->

