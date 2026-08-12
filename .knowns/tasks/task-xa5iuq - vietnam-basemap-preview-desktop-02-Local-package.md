---
id: xa5iuq
title: "[vietnam-basemap-preview-desktop-02] Local package và Google online source adapters"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-desktop
  - spec-date:2026-08-11
createdAt: '2026-08-11T09:05:31.328Z'
updatedAt: '2026-08-11T09:41:26.172Z'
completedAt: '2026-08-11T09:41:26.172Z'
timeSpent: 235
assignee: '@me'
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
- [x] #1 Source selector chuyển được giữa local package và online/LAN source.
- [x] #2 Online mode dùng đúng Google raster tile template đã khóa và hiển thị external source/attribution.
- [x] #3 Local package được validate compatibility/assets trước render; Google tile failure hiển thị lỗi và không tự fallback.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Tạo typed preview source contract và source selector state cho `online`/`offline`; verify chỉ expose read-only source metadata.
2. Implement Google raster adapter với template khóa D8, external attribution và trạng thái tile error không fallback; add unit tests cho URL/metadata/error policy.
3. Implement local package adapter: đọc manifest/style/assets qua command bridge, validate contract/path/external URL trước khi tạo style; add tests cho package hợp lệ và package không tương thích.
4. Thêm Tauri command đọc package-relative bytes với canonical path boundary, chạy TypeScript/Rust tests và validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan saved for local package and Google online source adapters.
Implemented standalone source selector, Google raster adapter with exact locked template/attribution/error-only policy, and local package adapter with manifest/assets/style validation.
Added preview-only Tauri package-file command with canonical root and traversal-safe relative paths; no production imports or release lifecycle operations.
Verification: npx tsc --noEmit -p vietnam-basemap-preview/tsconfig.json; npm run build:basemap-preview; npx vitest run --config vietnam-basemap-preview/vitest.config.ts (5 passed); cargo test --manifest-path vietnam-basemap-preview/src-tauri/Cargo.toml (4 passed).
System Decision Impact: none — adapters implement the approved preview contract without adding durable guidance
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
Reopened for final audit fix: local package tile archive is now served through PMTiles byte-range protocol.
Final audit fix verified: local PMTiles archive adapter uses `pmtiles://package` with byte-range reads; Google/error policy and manifest validation remain unchanged.
Verification: npm run build:basemap-preview-debug; npm run verify:basemap-preview; npx tsc --noEmit -p vietnam-basemap-preview/tsconfig.json; npx vitest run --config vietnam-basemap-preview/vitest.config.ts (5 passed); cargo test --manifest-path vietnam-basemap-preview/src-tauri/Cargo.toml (4 passed).
System Decision Impact: none — final local tile integration remains within the approved preview contract
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
<!-- SECTION:NOTES:END -->

