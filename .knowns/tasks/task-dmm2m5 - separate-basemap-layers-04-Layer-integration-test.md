---
id: dmm2m5
title: "[separate-basemap-layers-04] Layer integration tests and spec verification"
status: done
priority: high
labels:
  - from-spec
  - spec:separate-basemap-layers
  - spec-date:2026-08-12
createdAt: '2026-08-12T13:32:26.761Z'
updatedAt: '2026-08-12T13:57:23.516Z'
completedAt: '2026-08-12T13:57:23.516Z'
timeSpent: 205
assignee: '@me'
spec: specs/2026-08-12/separate-basemap-layers
fulfills:
  - AC-12
order: 40
---
# [separate-basemap-layers-04] Layer integration tests and spec verification

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bổ sung integration/acceptance tests cho các nguồn và trạng thái layer, xác nhận Google vẫn preview-only, attribution/error policy không đổi, rồi chạy verification toàn spec.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Bổ sung acceptance tests cho cả Google và Local package.
- [x] #2 Xác nhận Google preview-only, attribution và error-only policy không đổi.
- [x] #3 Chạy typecheck, unit/integration tests, build, smoke verifier và Knowns SDD validation.
- [x] #4 Ghi nhận Spec Decision Compliance cho D1-D22 và System Decision Impact.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Extend integration acceptance coverage for Google Street/Hybrid source metadata, raster preservation, precise Google capability filtering, and error-only/no-fallback behavior.
2. Extend Local package acceptance coverage for source-layer/ID capability mapping, unmapped layer preservation, fixed ordering, and independent group visibility.
3. Run frontend typecheck, all unit/integration tests, production build, Tauri fmt/check/test, smoke verifier when debug artifacts are available, and Knowns SDD validation.
4. Review the integrated diff, record all D1-D22 compliance and System Decision Impact, then complete the final task.

Scope boundary: no new product behavior beyond the approved spec and previously completed renderer/UI tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review: PASS — integrated acceptance coverage exercises Google Street/Hybrid and Local package adapters, capabilities, attribution, error-only/no-fallback policy, and unmapped Local layer preservation. No P1/P2 findings; diagnostics clean.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass, D21=pass, D22=pass
System Decision Impact: none — integration tests and verification confirm approved behavior without adding durable guidance.
Verification: root npm run check passed; npm run verify:basemap-preview passed; Knowns task validation clean.
Lifecycle sync: reopening briefly to let Knowns propagate fulfilled Spec ACs after final compliance metadata.
<!-- SECTION:NOTES:END -->

