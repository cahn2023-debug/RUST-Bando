---
id: pisu44
title: "[design-canvas-pmp-only-04] Preserve DESIGN overlays and add regression coverage"
status: done
priority: medium
labels:
  - from-spec
  - spec:design-canvas-pmp-only
  - spec-date:2026-08-15
createdAt: '2026-08-15T09:43:32.722Z'
updatedAt: '2026-08-15T10:50:36.858Z'
completedAt: '2026-08-15T10:42:40.208Z'
timeSpent: 93
assignee: '@me'
spec: specs/2026-08-15/design-canvas-pmp-only
fulfills:
  - AC-6
order: 40
---
# [design-canvas-pmp-only-04] Preserve DESIGN overlays and add regression coverage

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Verify selection highlights, edit handles, labels and temporary previews remain wired after background removal, and add regression coverage for the integrated canvas behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Selection, edit, label and temporary preview overlays remain visible and interactive.
- [x] #2 Regression tests cover background absence, persisted/unsaved object lifecycle and exit warning behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify MapLayer and CADCanvas still compose the selection, edit, label/FOV and temporary preview overlay components above the transparent renderer. 2. Add a focused MapLayer overlay contract test that asserts the feature surface remains interactive and all overlay components stay mounted. 3. Run the integrated regression suite for transparent style, draft persistence lifecycle and exit warning behavior. 4. Validate, review, and record System Decision Impact plus D1-D4 compliance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan check: AC-1 is covered by steps 1-2; AC-2 by steps 2-3. Existing overlay components are already wired in MapLayer/CADCanvas; this task adds regression coverage without changing their behavior.
Verification: integrated targeted suite passed (7 files, 47 tests); package typecheck passed; targeted ESLint passed with 0 errors and only pre-existing warnings. Review: PASS — 0 P1, 0 P2, 0 P3. Artifact verification: MapLayer overlay composition is substantive and wired; regression test covers transparent surface and measurement interaction. System Decision Impact: none — this is regression coverage for existing overlay wiring and adds no durable project guidance. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass
Final verification: integrated targeted suite remains 47/47 after final navigation guard changes; overlay contract remains passing
Final verification after D2 hardening: integrated suite 8 files, 56 tests passed; overlay contract remains covered
Final regression extension: integrated suite now 9 files, 58 tests passed
<!-- SECTION:NOTES:END -->

