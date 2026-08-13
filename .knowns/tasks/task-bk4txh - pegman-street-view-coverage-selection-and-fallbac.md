---
id: bk4txh
title: "[pegman-street-view-coverage-selection-and-fallback-02] Pegman coverage mode and map interaction"
status: done
priority: high
labels:
  - from-spec
  - spec:pegman-street-view-coverage-selection-and-fallback
  - spec-date:2026-08-12
createdAt: '2026-08-12T16:56:53.687Z'
updatedAt: '2026-08-12T17:20:39.307Z'
completedAt: '2026-08-12T17:15:51.172Z'
timeSpent: 215
assignee: '@me'
spec: specs/2026-08-12/pegman-street-view-coverage-selection-and-fallback
fulfills:
  - AC-1
  - AC-3
  - AC-4
  - AC-5
  - AC-7
  - AC-8
  - AC-12
  - AC-14
order: 20
---
# [pegman-street-view-coverage-selection-and-fallback-02] Pegman coverage mode and map interaction

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wire Pegman active/cancel/retry state into the preview map, render blue semi-transparent coverage segments, refresh on viewport changes, lock selection while loading, select nearest panorama, and preserve existing Pegman marker behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pegman button toggles active selection mode and exposes active state.
- [x] #2 Local coverage is rendered as blue semi-transparent line coverage and refreshed on map moveend.
- [x] #3 Selection is locked while coverage updates; nearest panorama is returned on map click.
- [x] #4 Right-click cancels selection mode and existing package-without-coverage remains usable.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Extend MapCanvas with an explicit Pegman coverage mode and callbacks for coverage status, nearest-panorama selection, and right-click cancellation.
2. Add a GeoJSON line source/layer for local coverage segments, hide/show it with the mode, and refresh the filtered local coverage on map load and moveend while retaining the previous data during loading.
3. Update BasemapPreviewApp and FloatingControls so the Pegman button toggles active mode, surfaces local/loading/empty/error states, and receives selected viewpoints without using the old arbitrary-point open guard.
4. Add focused tests for coverage state/selection helper behavior where deterministic, then run typecheck, focused Vitest, build and diff checks.
5. Validate and review the task before completion.

Coverage: AC-1, AC-3, AC-4, AC-5, AC-7, AC-8, AC-12, AC-14.
Dependency: uses the local coverage contract from task 552dl2; Street View window lifecycle remains in task mzpvou.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Sequential flow after task 552dl2. Map interaction scope only; lifecycle remains task mzpvou.
Review: PASS — no P1/P2 findings. Verification: npm run typecheck; focused Vitest 2 files/10 tests; cargo clippy -p basemap_contract -p basemap_builder --all-targets -- -D warnings; git diff --check. Remaining lifecycle/open-close behavior is task mzpvou. System Decision Impact: none — UI wiring follows the local coverage contract candidate created by task 552dl2 and introduces no additional durable guidance. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.
Task completed; source implementation verified and reviewed.
System Decision Impact: none — UI wiring follows the local coverage contract candidate created by task 552dl2 and introduces no additional durable guidance.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass
<!-- SECTION:NOTES:END -->

