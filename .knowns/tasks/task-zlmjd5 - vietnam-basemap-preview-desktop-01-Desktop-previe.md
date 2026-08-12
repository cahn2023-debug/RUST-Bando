---
id: zlmjd5
title: "[vietnam-basemap-preview-desktop-01] Desktop preview shell và launch configuration"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-desktop
  - spec-date:2026-08-11
createdAt: '2026-08-11T09:05:31.286Z'
updatedAt: '2026-08-11T09:21:40.127Z'
completedAt: '2026-08-11T09:21:40.127Z'
timeSpent: 747
assignee: '@me'
spec: specs/2026-08-11/vietnam-basemap-preview-desktop
fulfills:
  - AC-1
  - AC-2
  - AC-10
order: 10
---
# [vietnam-basemap-preview-desktop-01] Desktop preview shell và launch configuration

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tạo executable preview standalone, window shell tiếng Việt, nhận config/command line và không phụ thuộc app nghiệp vụ.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Desktop preview khởi chạy độc lập với app nghiệp vụ và hiển thị shell tiếng Việt.
- [x] #2 Nhận được configuration/command line cho local package và giữ được cấu hình hợp lệ gần nhất.
- [x] #3 Có smoke test cho launch thành công và boundary không dùng project/database/IPC của app hiện tại.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Tạo workspace frontend độc lập tại `vietnam-basemap-preview/` với entrypoint Vite, style và package metadata riêng; verify không import `src/` hoặc production Tauri.
2. Tạo Tauri shell Rust tối giản (`vietnam-basemap-preview/src-tauri`) chỉ khởi chạy cửa sổ preview, không database, project, IPC command hay app-domain dependency.
3. Nhận local package qua CLI/config (`--package`, `VIETNAM_BASEMAP_PACKAGE`) và truyền cấu hình an toàn cho frontend; verify launch contract bằng unit/smoke tests.
4. Thêm script build/debug riêng tạo `.exe` và `.pdb`, giữ output ở thư mục debug preview; verify bằng typecheck/build và cargo check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan saved for standalone preview shell and launch configuration.
Implemented standalone Vite/Tauri preview shell under vietnam-basemap-preview; no production app/database/domain imports.
Verification: npm run build:basemap-preview; npx tsc --noEmit -p vietnam-basemap-preview/tsconfig.json; cargo test --manifest-path vietnam-basemap-preview/src-tauri/Cargo.toml (3 passed); npm run build:basemap-preview-debug produced EXE/PDB.
System Decision Impact: none — shell and launch configuration implement the approved spec without adding durable guidance
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
<!-- SECTION:NOTES:END -->

