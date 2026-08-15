---
id: rfjg63
title: "[design-canvas-pmp-only-03] Warn about unsaved DESIGN data on exit"
status: done
priority: medium
labels:
  - from-spec
  - spec:design-canvas-pmp-only
  - spec-date:2026-08-15
createdAt: '2026-08-15T09:43:32.642Z'
updatedAt: '2026-08-15T10:50:36.784Z'
completedAt: '2026-08-15T10:39:49.172Z'
timeSpent: 50
assignee: '@me'
spec: specs/2026-08-15/design-canvas-pmp-only
fulfills:
  - AC-4
  - AC-7
order: 30
---
# [design-canvas-pmp-only-03] Warn about unsaved DESIGN data on exit

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Detect unsaved DESIGN changes and show a save warning only when leaving DESIGN or closing/reopening a project, explaining that discarded changes will not return after reopen.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Exit and project-close flows warn when DESIGN data is unsaved.
- [x] #2 Normal editing does not show a continuous or repeated unsaved warning.
- [x] #3 Warning communicates the consequence of not saving.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a single unsaved-DESIGN exit guard in App for tab changes, project open/close, tab close, reload and beforeunload, with the consequence message from the approved spec. 2. Remove automatic flush/save from DESIGN exit and reload; keep Save and Force Save flushing drafts. 3. Extend TabContainer callbacks so a canceled project switch/close does not mutate the active tab. 4. Add App workspace regression tests for warning, cancel, continue, and no autosave behavior. 5. Run targeted tests/lint, validate, review, and record System Decision Impact plus D1-D4 compliance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan check: AC-1 is covered by steps 1-3; AC-2 by steps 1 and 4; AC-3 by the warning copy and step 4. Scope is limited to App/TabContainer navigation wiring and tests; no new dependency.
Verification: App workspace tests passed (3/3); targeted ESLint passed with 0 errors and pre-existing warnings. Review: PASS — 0 P1, 0 P2, 0 P3. System Decision Impact: none — this only wires the approved warning lifecycle and does not add durable project guidance. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass
Final verification: integrated targeted suite remains 47/47 after native refresh/logout guard wiring; typecheck passed; ESLint 0 errors
Final verification after D2 hardening: integrated suite 8 files, 56 tests passed; warning lifecycle remains covered
Final regression extension: TabContainer cancellation tests included; integrated suite now 9 files, 58 tests passed
<!-- SECTION:NOTES:END -->

