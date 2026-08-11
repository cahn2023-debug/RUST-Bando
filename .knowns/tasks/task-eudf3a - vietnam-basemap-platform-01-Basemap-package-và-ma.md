---
id: eudf3a
title: "[vietnam-basemap-platform-01] Basemap package và manifest contract"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-platform
  - spec-date:2026-08-11
createdAt: '2026-08-11T06:37:16.723Z'
updatedAt: '2026-08-11T07:42:32.996Z'
completedAt: '2026-08-11T06:51:16.755Z'
timeSpent: 757
assignee: '@me'
spec: specs/2026-08-11/vietnam-basemap-platform
fulfills:
  - AC-8
  - AC-9
  - AC-10
order: 10
---
# [vietnam-basemap-platform-01] Basemap package và manifest contract

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Định nghĩa boundary của Basemap Platform, release package layout, manifest/version contract và loại trừ dữ liệu nghiệp vụ của project.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tạo manifest contract có version, coverage, source metadata, contract/schema version, default style và attribution metadata.
- [x] #2 Định nghĩa package boundary không chứa feature/domain data của project nghiệp vụ.
- [x] #3 Thêm contract tests cho manifest compatibility và active-version metadata.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Establish the standalone `vietnam-basemap/` boundary without modifying the existing app.
   - Add a small Cargo workspace and README that define release-package contents, online/offline ownership, and the exclusion of project/business data.
   - Keep the new workspace independent from `src/`, `src-tauri/`, the SQLite database, and the existing frontend basemap runtime.

2. Implement the reusable manifest/version contract in `vietnam-basemap/crates/basemap_contract/`.
   - Define serde types for manifest identity, contract/schema version, coverage, source metadata, style references, asset references, and active-release metadata.
   - Keep tile container/format represented as contract data so later pipeline work can choose the implementation without changing client semantics.
   - Add compatibility validation for manifest and active-version metadata.

3. Publish a machine-readable contract fixture/schema under `vietnam-basemap/contracts/`.
   - Include a valid sample manifest covering the required metadata and a package-layout contract.
   - Explicitly document that the package contains basemap assets only and never project feature/domain data.

4. Add contract tests.
   - Round-trip the valid manifest through JSON.
   - Reject incompatible schema/contract versions and invalid active-release metadata.
   - Verify source lists, coverage, default style, attribution metadata, and package-boundary assumptions.

5. Verify and record the task result.
   - Run `cargo fmt --check`, `cargo check`, and `cargo test` against the standalone workspace.
   - Run Knowns task/spec validation and append implementation notes only after the checks pass.

### Plan check

- AC coverage: AC-8 and AC-9 are covered by steps 1–4; AC-10 is covered by steps 2 and 4.
- Scope: only the new standalone contract workspace and its tests/docs; no current app integration, tile generation, or runtime serving in this task.
- Dependency: no sibling task is required before the contract boundary exists; tasks 02–07 depend on this contract.
- Assumption: `vietnam-basemap/` is a standalone project directory inside the current workspace and can later be extracted as its own repository without changing the contract.
- Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
- System Decision Impact: this task implements the draft platform-boundary decision referenced by the approved spec; no acceptance of that draft decision occurs here.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan drafted from @doc/specs/2026-08-11/vietnam-basemap-platform. Existing frontend basemap runtime remains out of scope for task 01; implementation will use a new vietnam-basemap/ workspace.
Implemented standalone vietnam-basemap/ workspace with package boundary README, package-layout contract, manifest JSON schema/fixture, basemap_contract Rust crate, active-release metadata validation, and contract tests.
Verification: cargo fmt --check, cargo check, cargo test (6 integration tests), cargo clippy --all-targets -- -D warnings, and git diff --check passed.
Review: PASS; no P1/P2 findings. Existing app/frontend/backend changes were preserved. Runtime wiring is intentionally deferred to tasks 04–07.
System Decision Impact: candidate @decision/20260811-1311-standalone-vietnam-basemap-platform-and-release-contract (added) — established the standalone package/manifest boundary; candidate remains draft and is linked to this task/spec.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass
<!-- SECTION:NOTES:END -->

