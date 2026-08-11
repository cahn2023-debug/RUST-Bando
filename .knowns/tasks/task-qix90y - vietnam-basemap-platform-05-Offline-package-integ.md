---
id: qix90y
title: "[vietnam-basemap-platform-05] Offline package integration"
status: done
priority: medium
labels:
  - from-spec
  - spec:vietnam-basemap-platform
  - spec-date:2026-08-11
createdAt: '2026-08-11T06:37:16.892Z'
updatedAt: '2026-08-11T07:42:39.002Z'
completedAt: '2026-08-11T07:10:59.062Z'
timeSpent: 146
assignee: '@me'
spec: specs/2026-08-11/vietnam-basemap-platform
fulfills:
  - AC-5
  - AC-8
order: 50
---
# [vietnam-basemap-platform-05] Offline package integration

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cho phép client desktop/local đọc release package cục bộ theo cùng manifest/version contract và render không cần Internet.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Resolve manifest, style và assets từ package cục bộ.
- [x] #2 Reject package không tương thích trước khi render và báo lỗi có thể kiểm tra.
- [x] #3 Thêm test chạy khi external network/CDN không khả dụng.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Add a `basemap_offline` crate to the standalone workspace.
   - Open a package root through the shared manifest contract and canonicalize it safely.
   - Expose manifest, style, tile, font, and sprite package-relative paths for a desktop/local adapter.

2. Implement compatibility and asset validation.
   - Validate contract/schema versions and manifest metadata before returning a usable package.
   - Check every declared style and asset exists inside the package root.
   - Reject traversal/absolute paths and styles containing external HTTP/CDN resources.

3. Implement local style resolution.
   - Read a declared style by ID, validate its JSON and offline placeholders, and return the style content plus package-relative asset references.
   - Keep the resolver independent from MapLibre/Tauri so task 07 can adapt it through the existing client boundary.

4. Add offline tests and usage documentation.
   - Test valid package resolution with no network.
   - Test missing assets, incompatible manifest versions, unsafe paths, unknown styles, and external URLs.
   - Document the local package contract and expected release directory.

5. Verify and complete the task.
   - Run fmt, check, test, clippy and task validation.
   - Append System Decision Impact and D1–D13 compliance notes before stopping the timer and marking the task done.

### Plan check

- AC coverage: AC-5 is covered by steps 1–4; AC-8 is covered by steps 1–3.
- Scope: package reader/validator only; no Tauri or React wiring until task 07.
- Dependency: consumes contract, builder output shape, styles and asset rules from tasks 01–04.
- Security: all local paths are canonicalized and constrained to the package root; external URLs are rejected before render.
- Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan drafted from @doc/specs/2026-08-11/vietnam-basemap-platform; consumes package/service/style contracts from tasks 01–04.
Implemented basemap_offline::OfflinePackage resolver with canonical package-root containment, shared manifest compatibility validation, declared style/tile/font/sprite existence checks, safe package-relative paths, and offline style parsing.
External HTTP/CDN URLs in styles, missing assets, incompatible versions, unknown styles, and traversal paths are rejected before style content is returned.
Added offline package documentation and 3 resolver tests; no network access or MapLibre/Tauri dependency is used.
Verification: cargo fmt --check, cargo check, cargo test (3 offline + 2 service + 3 builder + 2 style + 6 contract tests), cargo clippy --all-targets -- -D warnings passed.
Review: PASS; no P1/P2 findings.
System Decision Impact: candidate @decision/20260811-1311-standalone-vietnam-basemap-platform-and-release-contract (added) — established the local/offline package validation boundary; candidate remains draft.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass
<!-- SECTION:NOTES:END -->

