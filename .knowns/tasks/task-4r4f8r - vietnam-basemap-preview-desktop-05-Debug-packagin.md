---
id: 4r4f8r
title: "[vietnam-basemap-preview-desktop-05] Debug packaging và end-to-end verification"
status: todo
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-desktop
  - spec-date:2026-08-11
createdAt: '2026-08-11T09:05:31.462Z'
updatedAt: '2026-08-11T09:05:46.889Z'
timeSpent: 0
spec: specs/2026-08-11/vietnam-basemap-preview-desktop
fulfills:
  - AC-1
  - AC-8
  - AC-10
order: 50
---
# [vietnam-basemap-preview-desktop-05] Debug packaging và end-to-end verification

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build EXE/PDB riêng, smoke test online/local, kiểm tra lỗi Google tile và package không tương thích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Build debug tạo executable standalone và PDB riêng cho preview.
- [ ] #2 Smoke test xác nhận online configuration và local package configuration khởi chạy được.
- [ ] #3 Verification bao phủ Google tile failure, invalid package, read-only boundary và không làm thay đổi production Basemap Platform.
<!-- AC:END -->

