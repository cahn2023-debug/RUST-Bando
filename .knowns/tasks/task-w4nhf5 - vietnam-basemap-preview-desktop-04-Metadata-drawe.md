---
id: w4nhf5
title: "[vietnam-basemap-preview-desktop-04] Metadata drawer và read-only boundary"
status: done
priority: medium
labels:
  - from-spec
  - spec:vietnam-basemap-preview-desktop
  - spec-date:2026-08-11
createdAt: '2026-08-11T09:05:31.419Z'
updatedAt: '2026-08-11T09:31:26.579Z'
completedAt: '2026-08-11T09:31:26.579Z'
timeSpent: 182
assignee: '@me'
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
- [x] #1 Drawer/modal hiển thị source, style, version/manifest, health/loading/error và attribution theo trạng thái hiện tại.
- [x] #2 UI chỉ có thao tác xem, chọn source, chọn style và reset viewport.
- [x] #3 Không có code path activate, rollback, mutate release hoặc truy cập dữ liệu nghiệp vụ.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a read-only metadata drawer component fed by current adapter/style/map state, including source mode/name/version/manifest, health, loading/error and attribution.
2. Add local package directory picker using the preview dialog permission and feed its path into the existing launch/source adapter flow.
3. Keep the visible action set limited to source/style selection, viewport reset/navigation and metadata open/close; add boundary tests/scans for forbidden lifecycle/data paths.
4. Run strict frontend/build/adapter tests and validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan saved for metadata drawer, package picker, and read-only boundary.
Implemented Vietnamese read-only metadata drawer with source mode/name, external marker, style, version, manifest, launch origin, health/loading/error and attribution; attribution remains visible on the map.
Added Windows directory picker through the standalone dialog plugin; selected package feeds the existing local adapter validation flow.
Verification: npx tsc --noEmit -p vietnam-basemap-preview/tsconfig.json; npm run build:basemap-preview; npx vitest run --config vietnam-basemap-preview/vitest.config.ts (5 passed); cargo test --manifest-path vietnam-basemap-preview/src-tauri/Cargo.toml (4 passed); read-only boundary scan passed.
System Decision Impact: none — metadata and picker implement approved preview behavior without adding durable guidance
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
<!-- SECTION:NOTES:END -->

