---
id: 5m9287
title: "[vietnam-basemap-platform-04] Online Basemap Service API"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-platform
  - spec-date:2026-08-11
createdAt: '2026-08-11T06:37:16.851Z'
updatedAt: '2026-08-11T07:42:37.597Z'
completedAt: '2026-08-11T07:08:11.835Z'
timeSpent: 337
assignee: '@me'
spec: specs/2026-08-11/vietnam-basemap-platform
fulfills:
  - AC-4
  - AC-10
order: 40
---
# [vietnam-basemap-platform-04] Online Basemap Service API

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Triển khai service online phục vụ manifest, styles, tiles, fonts/glyphs, sprites, version và health qua contract ổn định.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Expose các resource online qua contract mà không lộ đường dẫn storage vật lý.
- [x] #2 Expose active version, service health và candidate/validation status cần thiết.
- [x] #3 Thêm API/contract tests cho happy path, missing asset và invalid version.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Add a `basemap_service` crate to the standalone workspace.
   - Use Axum/Tokio around the shared manifest contract.
   - Keep service state scoped to a selected immutable release directory and active version.

2. Implement the online contract routes.
   - Serve overview, manifest, style list/style content, tile/package assets, fonts/glyphs, sprites, version, and health.
   - Return JSON status for health/version and content types for style/asset responses.
   - Never return absolute storage paths or expose arbitrary filesystem files.

3. Add safe package resolution and startup validation.
   - Load and validate the active manifest before constructing the router.
   - Allow only package-relative paths without traversal, absolute paths, or backslashes.
   - Return stable 4xx/5xx responses for missing assets and invalid style/version requests.

4. Add service tests and runnable entrypoint.
   - Test health/version, manifest, styles, tile/font/sprite serving, missing assets, invalid versions, and traversal rejection against a temporary release fixture.
   - Add a small binary with environment-configured package root, active version, and bind address.

5. Verify and complete the task.
   - Run fmt, check, test, clippy and task validation.
   - Append System Decision Impact and D1–D13 compliance notes before stopping the timer and marking the task done.

### Plan check

- AC coverage: AC-4 is covered by steps 2–4; AC-10 is covered by steps 2–3.
- Scope: online service contract and tests; no client integration or release promotion UI in this task.
- Dependency: consumes contract, builder package layout, and styles from tasks 01–03.
- Security: path resolution is allowlisted to the selected release directory and rejects traversal/absolute paths.
- Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan drafted from @doc/specs/2026-08-11/vietnam-basemap-platform; consumes package contract, builder and style tasks.
Implemented basemap_service Axum/Tokio crate and runnable binary with active-release startup validation.
Exposed manifest, styles, style content, tiles, fonts, sprites, assets, health and version routes without exposing filesystem paths.
Added package-relative path guard, canonicalized release-root containment check, missing asset/version handling, and HTTP contract tests.
Verification: cargo fmt --check, cargo check, cargo test (2 service + 3 builder + 2 style + 6 contract tests), cargo clippy --all-targets -- -D warnings passed.
Review: PASS; no P1/P2 findings.
System Decision Impact: candidate @decision/20260811-1311-standalone-vietnam-basemap-platform-and-release-contract (added) — added the online service boundary and safe package serving behavior; candidate remains draft.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass
<!-- SECTION:NOTES:END -->

