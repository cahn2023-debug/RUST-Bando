# Implementation Plan

## Overview

Implement tasks to fix the map object display delay bug on large projects. The workflow follows the exploratory bugfix methodology: first write property-based tests to surface and confirm the bug on unfixed code, then implement the fix, and finally verify both fix and preservation properties pass.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3"] },
    { "wave": 3, "tasks": ["4"] }
  ]
}
```

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Feature Không Xuất Hiện Trong visibleFeatures Sau FeatureCreated/FeatureUpdated Trên Large Project
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate `visibleFeatures` is NOT updated after `FeatureCreated`/`FeatureUpdated` on large project
  - **Scoped PBT Approach**: Scope the property to concrete failing cases — `FeatureCreated` event with in-viewport coordinates on `isLargeProject = true` config
  - Simulate `FeatureCreated` event with a feature at valid in-viewport coordinates on a large project mock state
  - Assert that `feature.id IN state_after.visibleFeatures` after `applyPatchToState()` processes the event
  - Also assert `state_after.viewportTick > state_before.viewportTick` OR `queryVisibleFeaturesV2` was called
  - Repeat for `FeatureUpdated` event — assert updated coordinates are reflected in `visibleFeatures`
  - Run test on **UNFIXED** code
  - **EXPECTED OUTCOME**: Test FAILS (proves bug exists — feature is in `state.features` but missing from `visibleFeatures`)
  - Document counterexamples found (e.g., "After FeatureCreated, viewportTick unchanged, feature absent from visibleFeatures")
  - Mark task complete when test is written, run on unfixed code, and failure is documented
  - _Requirements: 1.5, 2.1, 2.2, 2.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Large Project & Viewport Pipeline Behavior Không Đổi
  - **IMPORTANT**: Follow observation-first methodology
  - **Step 1 — Observe on UNFIXED code**:
    - Observe: `FeatureCreated` on non-large project → `rawFeatures` is the data source, `viewportTick` unchanged
    - Observe: `moveend` event → `viewportTick` increments correctly
    - Observe: `FeatureCreated` with out-of-viewport coordinates on large project → feature NOT in `visibleFeatures`
    - Observe: `throttledSetState()` throttle 100ms applied normally
  - **Step 2 — Write property-based tests capturing observed behavior**:
    - Property: For all feature operations (FeatureCreated, FeatureUpdated, FeatureDeleted) on non-large project, `rawFeatures` remains the data source and `viewportTick` does NOT change
    - Property: For `moveend` events on large project, `viewportTick` still increments and `queryVisibleFeaturesV2` is still triggered
    - Property: For `FeatureCreated`/`FeatureUpdated` with coordinates outside current viewport on large project, feature does NOT appear in `visibleFeatures`
    - Property: `throttledSetState()` continues applying 100ms throttle — fix does not bypass it
  - Run tests on **UNFIXED** code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Fix map object display delay on large project

  - [x] 3.1 Implement the fix in `applyPatchToState()`
    - Locate the block in `applyPatchToState()` that handles `FeatureCreated` event
    - After updating `state.features`, add an `if (isLargeProject)` guard
    - Inside the guard: increment `viewportTick` to trigger the `queryVisibleFeaturesV2` subscription
    - Apply the same logic to the `FeatureUpdated` event handler block
    - Do NOT modify `renderFeatureValues`, `FOVLayer`, or `DORIOverlay` — the fix is state-layer only
    - Do NOT remove or bypass the `throttledSetState()` throttle
    - _Bug_Condition: isBugCondition(event, projectConfig) — event.type IN ['FeatureCreated','FeatureUpdated'] AND projectConfig.isLargeProject = TRUE AND viewportTick.incrementedAfterEvent = FALSE_
    - _Expected_Behavior: After fix, state_after.viewportTick > state_before.viewportTick (OR queryVisibleFeaturesV2 was called) AND feature.id IN state_after.visibleFeatures within ≤100ms throttle_
    - _Preservation: All non-large project paths untouched; moveend still increments viewportTick; out-of-viewport features still excluded; throttle 100ms unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Feature Xuất Hiện Trong visibleFeatures Ngay Sau FeatureCreated/FeatureUpdated Trên Large Project
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (feature in viewport → must appear in `visibleFeatures` after event processing)
    - When this test passes, it confirms `applyPatchToState()` now triggers `queryVisibleFeaturesV2` on large project
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — `viewportTick` increments and `visibleFeatures` is updated)
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Large Project & Viewport Pipeline Behavior Không Đổi
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — non-large project path unchanged, moveend still works, out-of-viewport exclusion preserved, throttle intact)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint — Ensure all tests pass
  - Run all unit tests for `applyPatchToState()` with `FeatureCreated` event on large project → assert `viewportTick` increments
  - Run all unit tests for `applyPatchToState()` with `FeatureUpdated` event on large project → assert `viewportTick` increments
  - Run all unit tests for `applyPatchToState()` with `FeatureCreated` event on non-large project → assert `viewportTick` does NOT increment
  - Run integration test: create Feature on large project → verify Feature appears on map immediately (no pan required)
  - Run integration test: update Feature coordinates on large project → verify map reflects new position immediately
  - Run integration test: create camera Feature on large project → verify FOVLayer and DORIOverlay receive feature immediately
  - Run integration test: pan map after fix → verify `moveend` flow still works normally
  - Ensure all tests pass; ask the user if questions arise

## Notes

- Tasks 1 and 2 are standalone property-based test tasks that MUST be completed BEFORE implementing the fix (task 3)
- Task 1 (Bug Condition PBT) is expected to FAIL on unfixed code — this failure is the goal, not a problem
- Task 2 (Preservation PBT) is expected to PASS on unfixed code — confirms baseline behavior to preserve
- The fix is scoped entirely to `applyPatchToState()` — no changes needed to `renderFeatureValues`, `FOVLayer`, or `DORIOverlay`
- The `if (isLargeProject)` guard is critical to prevent any regression on non-large project paths
- After the fix, task 1 should also PASS (same test, now confirms expected behavior)
