---
id: iibd2k
title: "[google-public-street-view-coverage-overlay-fallback-02] Coverage overlay and click fallback"
status: done
priority: high
labels:
  - from-spec
  - spec:google-public-street-view-coverage-overlay-fallback
  - spec-date:2026-08-13
createdAt: '2026-08-13T01:52:34.535Z'
updatedAt: '2026-08-13T02:13:53.377Z'
completedAt: '2026-08-13T02:09:59.385Z'
timeSpent: 428
assignee: '@me'
spec: specs/2026-08-13/google-public-street-view-coverage-overlay-fallback
fulfills:
  - AC-2
  - AC-3
  - AC-4
  - AC-5
  - AC-6
order: 20
---
# [google-public-street-view-coverage-overlay-fallback-02] Coverage overlay and click fallback

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hiển thị coverage public khi bật Pegman, refresh theo pan/zoom, giữ overlay cũ khi loading, chọn panorama gần nhất khi có coverage và fallback mở Street View theo tọa độ khi không có coverage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pegman activation requests public coverage and renders normalized segments as the blue overlay when available.
- [x] #2 Viewport changes refresh coverage without stale responses overwriting newer data; old overlay remains while loading.
- [x] #3 Coverage failures/empty payloads hide the overlay silently while Pegman and map clicks remain usable.
- [x] #4 Clicks choose a nearest usable panorama or produce coordinate fallback without blocking during loading.
- [x] #5 Focused tests, typecheck, and validation pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the local-only coverage refresh in MapCanvas with the public best-effort adapter while preserving the existing GeoJSON overlay boundary.
2. Refresh coverage on Pegman activation and moveend, abort superseded requests, keep the previous viewport coverage while loading, and hide coverage silently on empty/error responses.
3. Keep map clicks enabled during loading: choose the nearest usable panorama from current coverage or create a coordinate fallback viewpoint.
4. Add focused interaction/coverage regression assertions and run TypeScript tests, build-level validation, and task SDD validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review: PASS — no P1/P2 findings after cleanup of stale JSONP requests and silent idle status. Integrated public coverage into MapCanvas: Pegman activation/moveend refresh, abortable revisions, old viewport overlay retained during loading, silent hide on empty/error, nearest panorama selection and coordinate fallback while clicks remain enabled. Verification: npm run typecheck; npm test (13 files, 54 tests); git diff --check. System Decision Impact: none — UI wiring follows the public coverage candidate created by task idc190; no additional durable guidance introduced. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
<!-- SECTION:NOTES:END -->

