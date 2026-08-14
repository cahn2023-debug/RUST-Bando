---
id: svrusz
title: "[active-code-workspace-standardization-05] Integrate compatibility, migration manifest, and verification"
status: done
priority: high
labels:
  - from-spec
  - spec:active-code-workspace-standardization
  - spec-date:2026-08-14
createdAt: '2026-08-14T07:47:45.866Z'
updatedAt: '2026-08-14T08:56:08.602Z'
completedAt: '2026-08-14T08:56:08.602Z'
timeSpent: 3029
assignee: '@me'
spec: specs/2026-08-14/active-code-workspace-standardization
fulfills:
  - AC-3
  - AC-4
  - AC-7
  - AC-8
  - AC-10
  - AC-11
---
# [active-code-workspace-standardization-05] Integrate compatibility, migration manifest, and verification

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update root orchestration and documentation, finalize the migration manifest with hashes and rollback state, run runtime/quality gates, review the integrated diff, and verify the approved spec.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Root commands no longer use an active legacy path and continue to run from the repo root.
- [x] #2 Migration manifest contains source/target ownership, hashes, conflicts, and rollback information.
- [x] #3 Rollback/dry-run and conflict handling are verified without overwrite or data loss.
- [x] #4 README and operating docs describe the canonical layout and commands.
- [x] #5 Review and SDD verification pass with all linked decisions compliant.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Update root package scripts from the retired BAK Project Manager path to `apps/project-manager`, preserving the existing command names and arguments.
2. Rewrite the root README and update current operational directory/status docs to describe `apps/project-manager`, `apps/graph-viewer`, `apps/apps-script`, `tools/sol-advisor`, `packages`, and the `data` hub; retain historical path references only where explicitly labeled as archive/manifest evidence.
3. Create `data/manifests/active-code-workspace-migration-2026-08-14.json` aggregating the inventory, Project Manager, and supporting-surface manifests with surface ownership, hash-manifest references, rollback mapping, conflict policy, and verification results.
4. Run read-only dry-run checks for existing-target conflicts, source/target/hash consistency, nested repository boundaries, and excluded dependency/artifact residue; do not overwrite or reverse the completed migration.
5. Run root `npm run typecheck`, `npm run build`, `npm run test:ci`, and `npm run check` as available, recording pre-existing environment blockers without hiding them; run SDD validation and review the complete diff.
6. Append task notes with AC checks, exact verification/blocker evidence, System Decision Impact candidate linkage, and Spec Decision Compliance D1–D12; stop timer and complete only after review/SDD gates are recorded.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
Verification: root npm run check passed (encoding, boundaries, typecheck, lint with 0 errors/1,095 warnings, 89 test files/564 tests, build, Rust 82 passed/1 ignored, clippy -D warnings). npm run tauri -- --version resolved tauri-cli 2.10.1. Dry-run checked 710 manifest targets: 0 missing, 0 unexpected mismatches, 0 old active roots, nested Git boundaries preserved, data ignore policy passed; two controlled post-migration hash adjustments are recorded explicitly.
Review: PASS. Four-perspective review found no P1/P2 findings. Root delegates, canonical docs, data hub policy, migration manifests, rollback guards, and nested repository boundaries are wired and substantive. Known Sol Advisor validation/test failures remain baseline blockers outside this migration scope.
SDD verification: targeted validation passed for spec specs/2026-08-14/active-code-workspace-standardization and linked tasks r39gpa, 9gyqfv, aqthf6, od1tg4, svrusz. Global SDD validation retains unrelated errors in ldoyga, 9texyq, and g8ckf8; no unrelated task was changed.
<!-- SECTION:NOTES:END -->

