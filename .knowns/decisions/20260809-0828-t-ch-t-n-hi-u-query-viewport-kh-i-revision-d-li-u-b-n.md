---
id: 20260809-0828-t-ch-t-n-hi-u-query-viewport-kh-i-revision-d-li-u-b-n
title: Tách tín hiệu query viewport khỏi revision dữ liệu bản đồ
status: draft
supersedes: []
supersededBy: []
tags:
  - map
  - viewport
  - state-management
sources:
  - '@doc/architecture/frontend'
  - '@doc/guides/development'
  - .kiro/specs/map-object-display-delay/bugfix.md
relatedDocs:
  - architecture/frontend
  - guides/development
  - .kiro/specs/map-object-display-delay/bugfix.md
relatedTasks:
  - if0p6x
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'related doc ".kiro/specs/map-object-display-delay/bugfix" is not readable: doc ".kiro/specs/map-object-display-delay/bugfix" not found'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedAt: '2026-08-09T01:28:11.578Z'
createdAt: '2026-08-09T01:28:11.578Z'
updatedAt: '2026-08-09T01:28:11.578Z'
---

## Context


## Decision

Trong large-project viewport-first mode, FeatureCreated/FeatureUpdated phát tín hiệu bằng viewportQueryRevision để MapLibreFastRenderer gọi lại queryVisibleFeaturesV2. viewportRevision chỉ đại diện cho thay đổi dữ liệu/render viewport và setViewportFeatures không được làm phát sinh vòng lặp query. Không inject feature mới trực tiếp vào visibleFeatures vì backend query phải giữ đúng giới hạn viewport.

## Alternatives Considered

Dùng viewportRevision làm dependency trực tiếp của renderer sẽ tạo vòng lặp vì setViewportFeatures cũng tăng revision; inject trực tiếp feature mới sẽ có nguy cơ đưa feature ngoài viewport vào cache.

## Consequences

State contract có thêm viewportQueryRevision; mọi renderer viewport-first phải subscribe tín hiệu này. Luồng non-large project và moveend giữ nguyên.
