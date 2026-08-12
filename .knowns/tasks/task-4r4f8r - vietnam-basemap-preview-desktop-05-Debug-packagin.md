---
id: 4r4f8r
title: "[vietnam-basemap-preview-desktop-05] Debug packaging và end-to-end verification"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-desktop
  - spec-date:2026-08-11
createdAt: '2026-08-11T09:05:31.462Z'
updatedAt: '2026-08-12T02:03:31.945Z'
completedAt: '2026-08-11T09:41:44.577Z'
timeSpent: 204
assignee: '@me'
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
- [x] #1 Build debug tạo executable standalone và PDB riêng cho preview.
- [x] #2 Smoke test xác nhận online configuration và local package configuration khởi chạy được.
- [x] #3 Verification bao phủ Google tile failure, invalid package, read-only boundary và không làm thay đổi production Basemap Platform.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Document standalone preview run/config/debug artifact workflow in `vietnam-basemap-preview/README.md`.
2. Add a deterministic smoke verifier for EXE/PDB presence, locked Google template, invalid-package/error-only behavior coverage and production boundary checks.
3. Run debug frontend + Tauri build, standalone adapter/Rust tests and smoke verifier; inspect final diff.
4. Validate task and complete it, then run whole-spec SDD validation and final integrated checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan saved for debug packaging and end-to-end verification.
Added standalone README, debug build script and deterministic smoke verifier.
Verification: npm run build:basemap-preview-debug produced dist/basemap-preview-debug/vietnam-basemap-preview.exe (13,445,120 bytes) and vietnam-basemap-preview.pdb (113,061,888 bytes); npm run verify:basemap-preview passed; npx tsc --noEmit -p vietnam-basemap-preview/tsconfig.json passed; adapter Vitest 5/5 passed; Rust tests 4/4 passed.
Production boundary check found no changes under vietnam-basemap, src/core or src-tauri; Google failure, invalid package and read-only paths are covered by adapter/Rust tests and smoke assertions.
System Decision Impact: none — packaging and verification operationalize the approved spec without adding durable guidance
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
Reopened for final audit fix verification: PMTiles local archive path is included in smoke coverage.
Final integrated verification after PMTiles fix: npm run build:basemap-preview-debug, npm run verify:basemap-preview, standalone TypeScript/Vitest and Rust tests all pass; no production Basemap Platform paths changed.
System Decision Impact: none — final verification only confirms approved behavior
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
Debug fix 2026-08-12: Root cause was the debug script invoking `cargo build` from repository root, so Tauri did not package `frontendDist` and the EXE retained `devUrl` 127.0.0.1:1421. Fix: build the standalone app from `vietnam-basemap-preview` via `tauri build --debug --no-bundle`, keep Vite output/config paths inside the standalone project, and copy the packaged debug EXE/PDB to `dist/basemap-preview-debug`. Exact EXE smoke launch remained running after 8s. Verification: npm run build:basemap-preview-debug; npm run verify:basemap-preview; npx tsc --noEmit -p vietnam-basemap-preview/tsconfig.json; Vitest 5 passed; Rust tests 4 passed.
System Decision Impact: none — packaging correction only
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
<!-- SECTION:NOTES:END -->

