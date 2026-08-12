---
id: 3l3rel
title: "[vietnam-basemap-preview-controls-and-integration-05] Integrated verification and standalone preview acceptance"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-controls-and-integration
  - spec-date:2026-08-12
createdAt: '2026-08-12T04:44:26.156Z'
updatedAt: '2026-08-12T05:58:55.374Z'
completedAt: '2026-08-12T05:58:55.374Z'
timeSpent: 451
assignee: '@me'
spec: specs/2026-08-12/vietnam-basemap-preview-controls-and-integration
fulfills:
  - AC-16
order: 50
---
# [vietnam-basemap-preview-controls-and-integration-05] Integrated verification and standalone preview acceptance

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tích hợp các slice, kiểm tra artifact wiring, cập nhật README vận hành cho layer/API/watcher/Street View và chạy bộ kiểm thử/build/SDD verification của standalone preview.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 README documents all new integration/configuration behavior.
- [x] #2 Integrated tests cover critical scenarios and no production contract leakage.
- [x] #3 Standalone checks/build run and blockers are recorded.
- [x] #4 Artifact exists/substantive/wired verification passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Cập nhật vietnam-basemap-preview/README.md với cách chạy, layer/config persistence, localhost HTTP/IPC/watcher, Zoom extend/định vị và Pegman Street View lifecycle/fallback.
2. Bổ sung acceptance tests tích hợp các contract preview: layer/source attribution, extent payload, config normalization, lifecycle sync và ranh giới read-only/không production contract.
3. Chạy standalone typecheck, toàn bộ Vitest, Cargo fmt/check/test, build và diff check; kiểm tra artifact exists/substantive/wired.
4. Review diff, validate task và SDD; ghi System Decision Impact cùng compliance D1-D20.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review: PASS — no P1/P2 findings. Artifact verification: README, integrated acceptance tests, preview route/bridge/controller, standalone build and read-only boundary are substantive and wired. System Decision Impact: none — documentation and acceptance coverage do not add durable guidance or alter production contracts. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.

System Decision Impact: none — no durable guidance or production contract changed.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.

Spec Decision Compliance: D20=pass

Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass
Review: PASS — no P1/P2 findings. Artifact verification: README documents operation, integration acceptance tests cover layers/payload/config/Street View/read-only boundary, and all preview artifacts are exists/substantive/wired. Verification passed: npm exec -- tsc -p tsconfig.json --noEmit; npx vitest run --config vitest.config.ts (8 files, 25 tests); npm run build; cargo fmt --manifest-path src-tauri/Cargo.toml -- --check; cargo check --manifest-path src-tauri/Cargo.toml; cargo test --manifest-path src-tauri/Cargo.toml (5/5); git diff --check. Build has only the existing MapLibre chunk-size warning. System Decision Impact: none — no durable guidance or production contract changed. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.
<!-- SECTION:NOTES:END -->

