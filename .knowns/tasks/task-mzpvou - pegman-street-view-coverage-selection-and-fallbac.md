---
id: mzpvou
title: "[pegman-street-view-coverage-selection-and-fallback-03] Street View lifecycle integration and regression coverage"
status: done
priority: high
labels:
  - from-spec
  - spec:pegman-street-view-coverage-selection-and-fallback
  - spec-date:2026-08-12
createdAt: '2026-08-12T16:56:53.729Z'
updatedAt: '2026-08-12T17:20:40.017Z'
completedAt: '2026-08-12T17:20:08.886Z'
timeSpent: 222
assignee: '@me'
spec: specs/2026-08-12/pegman-street-view-coverage-selection-and-fallback
fulfills:
  - AC-5
  - AC-6
  - AC-8
  - AC-9
  - AC-10
  - AC-11
  - AC-12
  - AC-14
order: 30
---
# [pegman-street-view-coverage-selection-and-fallback-03] Street View lifecycle integration and regression coverage

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Connect coverage selection to open/reuse/close Street View lifecycle, surface open and data-source errors in the map UI, verify local fallback messaging and Pegman termination on close, and add focused unit/integration regression tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Selected local panorama automatically opens or reuses the existing Street View window.
- [x] #2 Successful open hides coverage while Pegman remains active; open errors remain visible and retryable.
- [x] #3 Street View close event disables Pegman and clears the map viewpoint marker.
- [x] #4 Regression suite and integrated build checks pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Change the Pegman selection callback in BasemapPreviewApp to normalize the selected local panorama and immediately call the existing open/reuse Street View bridge.
2. Add a MapCanvas coverage-visibility control so successful open hides the line coverage while leaving Pegman selection active; restore visibility on open errors/retry.
3. Handle Street View error/closed sync events in the main app: show diagnostics, keep Pegman on errors, and turn Pegman off/clear the map viewpoint on close.
4. Add lifecycle regression assertions for public Street View URL/sync payload behavior and local coverage source boundaries; run the complete preview frontend test/build and Rust checks.
5. Review the integrated diff, validate all tasks/spec ACs, and complete SDD verification.

Coverage: AC-5, AC-6, AC-8, AC-9, AC-10, AC-11, AC-12, AC-14.
Dependency: tasks 552dl2 and bk4txh are complete; reuse existing openPreviewStreetView bridge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Sequential flow after coverage source and map interaction tasks. Reuse existing Street View bridge.
Review: PASS — no P1/P2 findings. Edge fix: moveend refresh now reads streetViewWindowOpenRef so coverage stays hidden after successful open/reuse. Verification: npm run typecheck; npm test (11 files, 46 tests); npm run build (existing large chunk warning only); cargo fmt --manifest-path Cargo.toml --all; cargo test -p basemap_contract -p basemap_builder; cargo clippy -p basemap_contract -p basemap_builder --all-targets -- -D warnings; git diff --check. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass. System Decision Impact: none — lifecycle wiring uses existing Street View bridge and the local coverage contract candidate; no additional durable guidance introduced.
Task completed; source implementation verified and reviewed.
System Decision Impact: none — lifecycle wiring uses existing Street View bridge and the local coverage contract candidate; no additional durable guidance introduced.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass
<!-- SECTION:NOTES:END -->

