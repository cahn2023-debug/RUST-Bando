---
id: w4nhf5
title: "[vietnam-basemap-preview-desktop-04] Metadata drawer và read-only boundary"
status: todo
priority: medium
labels:
  - from-spec
  - spec:vietnam-basemap-preview-desktop
  - spec-date:2026-08-11
createdAt: '2026-08-11T09:05:31.419Z'
updatedAt: '2026-08-11T09:05:46.382Z'
timeSpent: 0
spec: specs/2026-08-11/vietnam-basemap-preview-desktop
fulfills:
  - AC-7
  - AC-9
order: 40
---
# [vietnam-basemap-preview-desktop-04] Metadata drawer và read-only boundary

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hiển thị source, version, health, attribution, loading/error; loại bỏ thao tác mutate release hoặc dữ liệu nghiệp vụ.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Drawer/modal hiển thị source, style, version/manifest, health/loading/error và attribution theo trạng thái hiện tại.
- [ ] #2 UI chỉ có thao tác xem, chọn source, chọn style và reset viewport.
- [ ] #3 Không có code path activate, rollback, mutate release hoặc truy cập dữ liệu nghiệp vụ.
<!-- AC:END -->

