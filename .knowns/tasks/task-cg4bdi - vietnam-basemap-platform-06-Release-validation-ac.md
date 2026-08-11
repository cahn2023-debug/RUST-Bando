---
id: cg4bdi
title: "[vietnam-basemap-platform-06] Release validation, activation và rollback"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-platform
  - spec-date:2026-08-11
createdAt: '2026-08-11T06:37:16.926Z'
updatedAt: '2026-08-11T07:42:40.626Z'
completedAt: '2026-08-11T07:14:53.760Z'
timeSpent: 211
assignee: '@me'
spec: specs/2026-08-11/vietnam-basemap-platform
fulfills:
  - AC-3
  - AC-6
  - AC-7
order: 60
---
# [vietnam-basemap-platform-06] Release validation, activation và rollback

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Xây lifecycle candidate release, automated validation, manual approval, immutable active pointer và rollback an toàn.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Candidate chỉ active sau validation, health smoke test và manual approval.
- [x] #2 Giữ release immutable, hỗ trợ coexistence và rollback không rebuild.
- [x] #3 Khi candidate fail, active release cũ tiếp tục phục vụ và candidate báo lỗi.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Add a `basemap_release` crate to the standalone workspace.
   - Manage a release root containing immutable version directories and an active pointer file.
   - Keep release content read-only after build; activation only changes pointer metadata.

2. Implement candidate validation and manual activation.
   - Validate the candidate through the offline package resolver and every declared style.
   - Return a structured validation report with version and errors.
   - Require an explicit `activate` call after validation; refuse invalid candidates.

3. Implement safe active pointer and rollback.
   - Write active metadata only after validation succeeds, with recovery-safe pointer replacement.
   - Support coexistence of versions and rollback by activating an older immutable release.
   - Preserve the current pointer if candidate validation or pointer replacement fails.

4. Add lifecycle tests and operator CLI/docs.
   - Test valid candidate activation, invalid candidate preservation of the old active version, immutable release contents, coexistence, rollback, and validation status.
   - Add a small CLI for validate/activate/rollback and document the manual release workflow.

5. Verify and complete the task.
   - Run fmt, check, test, clippy and task validation.
   - Append System Decision Impact and D1–D13 compliance notes before stopping the timer and marking the task done.

### Plan check

- AC coverage: AC-3 is covered by steps 2–3; AC-6 and AC-7 are covered by steps 2–4.
- Scope: release lifecycle and pointer management; service/client wiring remains in task 07.
- Dependency: consumes builder output, offline package validation, and active-release contract from tasks 01–05.
- Safety: candidate failure never writes the active pointer; release directories are never mutated by activation/rollback.
- Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan drafted from @doc/specs/2026-08-11/vietnam-basemap-platform; consumes builder, service and offline release contracts.
Implemented basemap_release crate and CLI for candidate validation, manual activation, immutable version coexistence, active.json pointer management, and rollback.
Candidate validation reuses OfflinePackage and validates every declared style/assets; invalid candidates return structured reports and never replace the active pointer.
Pointer replacement uses a temporary file and backup recovery path; activation/rollback never mutate release directories.
Verification: cargo fmt --check, cargo check, cargo test (3 release + 3 offline + 2 service + 3 builder + 2 style + 6 contract tests), cargo clippy --all-targets -- -D warnings passed.
Review: PASS; no P1/P2 findings.
System Decision Impact: candidate @decision/20260811-1311-standalone-vietnam-basemap-platform-and-release-contract (added) — established manual validated activation and rollback behavior; candidate remains draft.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass
<!-- SECTION:NOTES:END -->

