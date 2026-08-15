---
id: axtx3f
title: "[design-canvas-pmp-only-02] Render PMP-backed and unsaved design objects"
status: done
priority: medium
labels:
  - from-spec
  - spec:design-canvas-pmp-only
  - spec-date:2026-08-15
createdAt: '2026-08-15T09:43:32.560Z'
updatedAt: '2026-08-15T10:50:36.838Z'
completedAt: '2026-08-15T10:33:59.502Z'
timeSpent: 540
assignee: '@me'
spec: specs/2026-08-15/design-canvas-pmp-only
fulfills:
  - AC-2
  - AC-3
  - AC-5
order: 20
---
# [design-canvas-pmp-only-02] Render PMP-backed and unsaved design objects

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Keep persisted feature hydration from the current .pmp as the reopen source of truth while retaining newly created or edited objects in the current runtime session until save or discard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Persisted objects load at the stored geometry and position.
- [x] #2 Unsaved runtime objects remain visible and interactive in the current session.
- [x] #3 Discarded unsaved objects are absent after reopening the same .pmp.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the design sync contract with draft events and an explicit `hasUnsavedChanges` state plus `stageEvent/stageEvents` actions; reset draft state on project initialization/reset.
2. Route canvas-created features and geometry edits through the draft path so optimistic state renders immediately while no persistence IPC is sent before Save/Force Save.
3. Make `flushPendingPersists` commit staged draft events as one backend batch, apply the backend acknowledgement, and clear the dirty state only after a successful commit; retain existing immediate commit behavior for explicit Property Panel saves.
4. Add focused store/drawing regression tests covering: persisted hydration, draft visibility without IPC, explicit flush persistence, and draft absence after reinitialization.
5. Run targeted tests, lint/typecheck checks, validate the task, and record review/System Decision/Spec Decision markers.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Architecture gate: current FeatureCreated/FeatureUpdated dispatch and queue paths persist automatically to the .pmp via invoke_design_event_batch/_internalBufferedSyncEvents (150ms buffer); Save/Force Save only flush/checkpoint. AC-5 requires explicit-save semantics and cannot be met by render filtering alone. Paused before planning pending user direction.
User direction: continue with explicit-save semantics for canvas-created/geometry-edited objects. Draft runtime events must not reach .pmp until Save/Force Save flushes them; discard/reopen hydrates persisted .pmp state. Existing explicit Property Panel commits remain unchanged.
Plan check: AC-2 is covered by existing initialization hydration plus regression coverage; AC-3 by steps 1-2 and tests; AC-5 by steps 1,3-4. Scope risk: central store plus drawing call sites touch more than five files, but the change is required by the approved explicit-save contract. D1=pass, D2=pass, D3=pass, D4=pass.
Verification: 36/36 targeted store and drawing-hook tests passed; targeted ESLint passed with pre-existing warnings; package typecheck remains blocked only by unrelated existing errors in RibbonTabContent.tsx and userConfirmation.ts. Review: PASS — 0 P1, 0 P2, 0 P3. System Decision Impact: none — explicit-save draft staging is scoped implementation behavior for the approved spec and adds no durable project guidance. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass
Final D2 hardening: project close resets design runtime state and reopening the active path with drafts forces persisted-state rehydration. Final verification: integrated suite 8 files, 56 tests passed; typecheck passed
Final regression extension: reopen/close lifecycle tests included; integrated suite now 9 files, 58 tests passed
<!-- SECTION:NOTES:END -->

