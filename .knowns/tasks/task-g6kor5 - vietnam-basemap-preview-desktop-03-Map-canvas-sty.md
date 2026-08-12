---
id: g6kor5
title: "[vietnam-basemap-preview-desktop-03] Map canvas, styles và viewport controls"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-desktop
  - spec-date:2026-08-11
createdAt: '2026-08-11T09:05:31.368Z'
updatedAt: '2026-08-11T09:41:28.541Z'
completedAt: '2026-08-11T09:41:28.541Z'
timeSpent: 111
assignee: '@me'
spec: specs/2026-08-11/vietnam-basemap-preview-desktop
fulfills:
  - AC-5
  - AC-6
order: 30
---
# [vietnam-basemap-preview-desktop-03] Map canvas, styles và viewport controls

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hiển thị MapLibre canvas, chuyển engineering/light/dark, pan/zoom và reset toàn cảnh Việt Nam.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Canvas render được source hiện tại và engineering là style mặc định.
- [x] #2 Chuyển runtime giữa engineering, light và dark không cần restart executable.
- [x] #3 Pan, zoom và reset về toàn cảnh Việt Nam hoạt động trên cửa sổ map toàn màn hình.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Implement MapLibre canvas boundary that consumes only a `PreviewSourceAdapter`, reports loading/ready/error and registers the local package protocol.
2. Wire App launch/source state to create online or validated local adapters and keep `engineering` as the initial style.
3. Add runtime style selector for `engineering`, `light`, `dark` plus map navigation/reset controls over a full-window canvas.
4. Add focused map/controller tests where DOM-independent, run strict typecheck/build/tests and validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan saved for MapLibre canvas, runtime styles, and viewport controls.
Implemented full-window MapLibre canvas wired through PreviewSourceAdapter, local `basemap://` package protocol, runtime engineering/light/dark style selection, pan/zoom, navigation and Vietnam extent reset.
Google tile errors are surfaced through adapter/map state and never trigger a fallback source.
Verification: npx tsc --noEmit -p vietnam-basemap-preview/tsconfig.json; npm run build:basemap-preview; npx vitest run --config vietnam-basemap-preview/vitest.config.ts (5 passed); boundary scan found no production/domain imports.
System Decision Impact: none — canvas and controls implement approved preview behavior without adding durable guidance
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
Reopened for final audit fix: MapLibre local protocol now uses PMTiles archive tiles.
Final audit fix verified: local PMTiles archive adapter uses `pmtiles://package` with byte-range reads; Google/error policy and manifest validation remain unchanged.
Verification: npm run build:basemap-preview-debug; npm run verify:basemap-preview; npx tsc --noEmit -p vietnam-basemap-preview/tsconfig.json; npx vitest run --config vietnam-basemap-preview/vitest.config.ts (5 passed); cargo test --manifest-path vietnam-basemap-preview/src-tauri/Cargo.toml (4 passed).
System Decision Impact: none — final local tile integration remains within the approved preview contract
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
<!-- SECTION:NOTES:END -->

