---
id: r5n8sr
title: "[map-svg-icon-01] Sửa lỗi SVG icon không hiển thị trên bản đồ"
status: done
priority: medium
labels:
  - tiny
  - map
  - svg
  - bug
createdAt: '2026-08-09T06:31:34.875Z'
updatedAt: '2026-08-09T07:51:10.167Z'
completedAt: '2026-08-09T06:35:50.981Z'
timeSpent: 0
assignee: '@me'
---
# [map-svg-icon-01] Sửa lỗi SVG icon không hiển thị trên bản đồ

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Điều tra và sửa lỗi SVG marker camera/intersection không hiển thị trong MapLibre/WebView; giữ nguyên icon/color/size contract, thêm regression coverage cho SVG rasterization và xác minh frontend quality gate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Add a regression assertion that every map icon output is a standalone SVG consumable by the image rasterization path, including camera and intersection variants.
2. Remove non-portable HTML/CSS filter constructs from the generated SVG string while preserving icon geometry, normalized color, size, label, and rotation.
3. Run targeted icon/map tests, typecheck, encoding, then the frontend quality gate; inspect the final diff and record the root cause.

### Plan check
- AC coverage: SVG display is covered by steps 1–2; contract preservation by step 2; regression/quality gate by step 3.
- Scope: 1 production icon file and 1 focused test file; no dependency or backend changes.
- Risk: low; only SVG serialization/rasterization markup changes, with existing MapLibre registration flow unchanged.
- Assumption: the screenshot is produced by the current MapLibre SVG-to-canvas path and the icon failure is caused by WebView SVG decoding rather than missing feature data.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: removed non-portable CSS/SVG filter markup from MapIcons.getIconSvgString so createImageBitmap receives a standalone decoder-safe SVG; added regression coverage for camera output. Root cause: WebView SVG rasterization can reject optional filter syntax before MapLibre map.addImage. Verification: targeted icon/map suite 4 files/77 tests passed; npm run check:frontend passed (encoding, boundaries, typecheck, lint with existing warnings, 597 tests/coverage, build); git diff --check passed. No backend or unrelated dirty files changed by this task.
Follow-up runtime evidence: pasted Tauri console showed MapLibre warning maxzoom 18 <= clusterMaxZoom 22 followed by repeated circle renderer TypeError. Root cause confirmed at mapLibreLayerSetup.ts:223-230 because GeoJSONSource defaults maxzoom to 18. Added maxzoom=MAP_POINT_CLUSTER_MAX_ZOOM+1 (23) and test assertion. Targeted map/icon suite 77 passed; npm run check:frontend passed on rerun. First full-gate failure was unrelated StaticCameraPreview fallback timing; isolated test passed twice.
Follow-up implementation completed: fixed the MapLibre GeoJSON source maxzoom contract (maxzoom=MAP_POINT_CLUSTER_MAX_ZOOM+1); added a stale-safe hydration barrier before SVG preload, feature data publication, and feature-state work; the barrier now covers both symbol and circle render layers because the reported runtime failure also occurred at circle.layout.get. Replaced noisy startup/performance info logs with opt-in VITE_DEBUG_LOGS (default false), while warnings/errors remain visible; stabilized render cache keys and deferred project state commit with initialization to reduce render churn. Added regression coverage for deferred render-layer hydration, SVG registration/data publication, maxzoom, and large-project viewport refresh. Verification: targeted MapLibreFastRenderer 36/36 and project-manager 7/7 tests passed; npm run typecheck passed; npm run check:frontend passed end-to-end (encoding, boundaries, typecheck, lint with pre-existing warnings only, full test/coverage, build); code-reviewer report found 0 findings; Knowns validation passed with 0 errors/warnings. System Decision Impact: none — scoped renderer hardening and opt-in diagnostics, with no public/API/schema contract change.
<!-- SECTION:NOTES:END -->

