---
id: 20260811-1558-google-raster-tiles-are-preview-only-for-the-standalone-basemap-viewer
title: Google raster tiles are preview-only for the standalone basemap viewer
status: draft
supersedes: []
supersededBy: []
tags:
  - basemap
  - preview
  - google-tiles
  - draft
sources:
  - '@doc/specs/2026-08-11/vietnam-basemap-platform'
  - '@doc/architecture/vietnam-basemap-platform-integration'
  - '@doc/specs/2026-08-11/vietnam-basemap-preview-desktop'
relatedDocs:
  - specs/2026-08-11/vietnam-basemap-platform
  - architecture/vietnam-basemap-platform-integration
  - specs/2026-08-11/vietnam-basemap-preview-desktop
relatedTasks: []
verification: []
reviewState: ready_for_review
reviewBlockers: []
reviewMatches: []
reviewAllowedResolutions:
  - accept_new
  - reject_new
reviewEvaluatedAt: '2026-08-11T08:58:44.688Z'
createdAt: '2026-08-11T08:58:35.311Z'
updatedAt: '2026-08-11T08:58:44.688Z'
---

## Context

Công cụ Basemap Preview desktop cần một nguồn online dễ kiểm tra trực quan, trong khi Basemap Platform production vẫn dùng release contract online/offline và asset self-hosted.

## Decision

Cho phép standalone Basemap Preview dùng cố định Google raster tile template `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}` làm nguồn online chính. Ngoại lệ này chỉ áp dụng cho preview read-only; không đưa Google tile dependency vào release package, Basemap Service production hoặc client runtime chính. Khi tile không tải được, UI chỉ báo lỗi và yêu cầu operator chọn nguồn khác, không tự động fallback.

## Alternatives Considered

1. Chỉ dùng Basemap Service/self-hosted contract trong preview. 2. Chỉ dùng local package. 3. Dùng Google raster tiles làm nguồn online preview nhưng giữ exception tách biệt khỏi production platform.

## Consequences

Preview có external network dependency và phải hiển thị source/attribution rõ ràng. Basemap production contract không thay đổi. Candidate cần được human review riêng trước khi trở thành guidance hiện hành.
