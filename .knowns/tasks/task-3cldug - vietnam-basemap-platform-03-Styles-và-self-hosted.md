---
id: 3cldug
title: "[vietnam-basemap-platform-03] Styles và self-hosted assets"
status: done
priority: medium
labels:
  - from-spec
  - spec:vietnam-basemap-platform
  - spec-date:2026-08-11
createdAt: '2026-08-11T06:37:16.807Z'
updatedAt: '2026-08-11T07:42:36.096Z'
completedAt: '2026-08-11T07:02:06.406Z'
timeSpent: 263
assignee: '@me'
spec: specs/2026-08-11/vietnam-basemap-platform
fulfills:
  - AC-1
  - AC-5
order: 30
---
# [vietnam-basemap-platform-03] Styles và self-hosted assets

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tạo ba style chuẩn và đóng gói font/glyph/sprite để basemap hoạt động offline không phụ thuộc CDN.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Cung cấp light, dark và engineering với engineering là default.
- [x] #2 Đóng gói font tiếng Việt, glyph và sprite trong release asset contract.
- [x] #3 Thêm offline asset checks bảo đảm không có external runtime dependency.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Add the three standard MapLibre style documents under `vietnam-basemap/styles/`.
   - Keep the shared vector source and asset placeholders stable for online/offline adapters.
   - Use distinct light, dark, and engineering palettes; engineering remains the default in the package examples.
   - Include the required baseline layers and Vietnamese label fallback expressions.

2. Add self-hosted asset source contracts.
   - Add sprite metadata and SVG icon sources under `vietnam-basemap/assets/`.
   - Document required Vietnamese glyph/font PBF inputs and the generated sprite PNG/JSON pair without committing unlicensed/vendor binaries.
   - Keep all asset paths package-relative and free of external runtime URLs.

3. Add automated style/asset checks.
   - Parse all three styles as JSON, assert MapLibre version/source/layer structure, offline placeholders, and absence of external tile/font/sprite providers.
   - Validate the sprite manifest and icon source inventory.
   - Run checks through the standalone Rust workspace test suite.

4. Verify and complete the task.
   - Run fmt, check, test, clippy and task validation.
   - Append System Decision Impact and D1–D13 compliance notes before stopping the timer and marking the task done.

### Plan check

- AC coverage: AC-1 is covered by steps 1–3; AC-5 is covered by steps 2–3.
- Scope: style JSON, local asset contracts/source icons, and checks; no frontend integration or binary vendor asset generation in this task.
- Dependency: consumes the package layout and builder contract from tasks 01–02; task 04/05 adapters resolve the placeholders.
- Assumption: operator-provided font/glyph PBF and generated sprite PNG are release inputs and require separate license-aware provisioning.
- Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan drafted from @doc/specs/2026-08-11/vietnam-basemap-platform; consumes package contract from tasks eudf3a/l4pkjd.
Implemented light, dark and engineering MapLibre styles with Vietnamese label fallback, D4 layer coverage including airport/ferry, and offline asset placeholders.
Added self-hosted font/glyph and sprite contracts, SVG icon sources, sprite metadata, and provider-independent asset documentation. Vendor font PBF and generated sprite PNG remain operator-provided release inputs.
Verification: cargo fmt --check, cargo check, cargo test (3 builder + 2 style + 6 contract tests), cargo clippy --all-targets -- -D warnings passed.
Review: PASS after adding airport/ferry style coverage; no P1/P2 findings.
System Decision Impact: candidate @decision/20260811-1311-standalone-vietnam-basemap-platform-and-release-contract (added) — established the three-style and self-hosted asset boundary; candidate remains draft.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass
<!-- SECTION:NOTES:END -->

