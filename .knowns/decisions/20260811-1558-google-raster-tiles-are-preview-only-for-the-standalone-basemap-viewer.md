---
id: 20260811-1558-google-raster-tiles-are-preview-only-for-the-standalone-basemap-viewer
title: Google raster tiles are preview-only for the standalone basemap viewer
status: accepted
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
relatedTasks:
  - zlmjd5
  - xa5iuq
  - g6kor5
  - w4nhf5
  - 4r4f8r
verification:
  - 'source:@doc/specs/2026-08-11/vietnam-basemap-platform'
  - 'source:@doc/architecture/vietnam-basemap-platform-integration'
  - 'source:@doc/specs/2026-08-11/vietnam-basemap-preview-desktop'
  - 'task:@task-zlmjd5:done'
  - 'task:@task-xa5iuq:done'
  - 'task:@task-g6kor5:done'
  - 'task:@task-w4nhf5:done'
  - 'task:@task-4r4f8r:done'
  - 'task:@task-3cldug:done'
  - 'task:@task-cg4bdi:done'
  - 'task:@task-eudf3a:done'
  - 'task:@task-5m9287:done'
  - 'task:@task-l4pkjd:done'
  - 'task:@task-5n9tjd:done'
  - 'task:@task-qix90y:done'
verifiedAt: '2026-08-12T01:32:06.456Z'
createdAt: '2026-08-11T08:58:35.311Z'
updatedAt: '2026-08-12T01:32:06.456Z'
---

## Context

Công cụ Basemap Preview desktop cần một nguồn online dễ kiểm tra trực quan, trong khi Basemap Platform production vẫn dùng release contract online/offline và asset self-hosted.

## Decision

Cho phép standalone Basemap Preview dùng cố định Google raster tile template `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}` làm nguồn online chính. Ngoại lệ này chỉ áp dụng cho preview read-only; không đưa Google tile dependency vào release package, Basemap Service production hoặc client runtime chính. Khi tile không tải được, UI chỉ báo lỗi và yêu cầu operator chọn nguồn khác, không tự động fallback.

## Alternatives Considered

1. Chỉ dùng Basemap Service/self-hosted contract trong preview. 2. Chỉ dùng local package. 3. Dùng Google raster tiles làm nguồn online preview nhưng giữ exception tách biệt khỏi production platform.

## Consequences

Preview có external network dependency và phải hiển thị source/attribution rõ ràng. Basemap production contract không thay đổi. Candidate cần được human review riêng trước khi trở thành guidance hiện hành.
