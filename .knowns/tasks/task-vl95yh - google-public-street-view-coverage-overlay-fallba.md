---
id: vl95yh
title: "[google-public-street-view-coverage-overlay-fallback-03] Street View lifecycle and regression tests"
status: done
priority: high
labels:
  - from-spec
  - spec:google-public-street-view-coverage-overlay-fallback
  - spec-date:2026-08-13
createdAt: '2026-08-13T01:52:34.605Z'
updatedAt: '2026-08-13T02:13:53.919Z'
completedAt: '2026-08-13T02:12:29.669Z'
timeSpent: 142
assignee: '@me'
spec: specs/2026-08-13/google-public-street-view-coverage-overlay-fallback
fulfills:
  - AC-7
  - AC-8
  - AC-9
order: 30
---
# [google-public-street-view-coverage-overlay-fallback-03] Street View lifecycle and regression tests

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Giữ Pegman active sau khi mở Street View, tái sử dụng cửa sổ hiện tại, tắt Pegman/xóa marker khi đóng cửa sổ và bổ sung integration tests, typecheck, build, Rust checks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Selected public or fallback viewpoint opens/reuses the existing Street View window while Pegman remains active.
- [x] #2 Street View close event disables Pegman, hides coverage, and clears the map marker.
- [x] #3 Open errors remain retryable without introducing a second window or API key.
- [x] #4 Regression tests, typecheck, build, Rust checks/tests, and task validation pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the existing Street View bridge reuses one preview window and maps ready/state/error/closed events into BasemapPreviewApp state.
2. Wire public-coverage selection and coordinate fallback through the existing open/reuse bridge without disabling Pegman after a successful open.
3. Ensure close/error cleanup hides coverage, clears the viewpoint marker, and preserves retry behavior; avoid adding a second window or API key.
4. Add regression assertions for lifecycle, keyless public URL, coverage fallback, and run full frontend/Rust validation plus SDD task validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review: PASS — no P1/P2 findings. Fixed StreetViewPreviewApp lifecycle effect so viewpoint updates reuse the existing window without re-registering listeners or emitting a false closed event; close still disables Pegman and clears the marker through the existing bridge. Added regression assertions for keyless public embed URL and stable route contract for window reuse. Verification: npm run typecheck; npm test (13 files, 55 tests); npm run build (existing large chunk warning only); npm run verify; cargo fmt --check; cargo check --workspace; cargo test --workspace; git diff --check. System Decision Impact: none — lifecycle fix and tests implement the approved preview coverage behavior; no additional durable guidance introduced. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
<!-- SECTION:NOTES:END -->

