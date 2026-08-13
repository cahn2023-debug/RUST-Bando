---
id: 552dl2
title: "[pegman-street-view-coverage-selection-and-fallback-01] Coverage source and nearest-panorama selection"
status: done
priority: high
labels:
  - from-spec
  - spec:pegman-street-view-coverage-selection-and-fallback
  - spec-date:2026-08-12
createdAt: '2026-08-12T16:56:53.642Z'
updatedAt: '2026-08-12T17:20:38.534Z'
completedAt: '2026-08-12T17:11:34.892Z'
timeSpent: 671
assignee: '@me'
spec: specs/2026-08-12/pegman-street-view-coverage-selection-and-fallback
fulfills:
  - AC-2
  - AC-3
  - AC-4
  - AC-10
  - AC-11
  - AC-13
  - AC-14
order: 10
---
# [pegman-street-view-coverage-selection-and-fallback-01] Coverage source and nearest-panorama selection

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement a typed local Street View coverage boundary for package/project data, viewport-scoped loading, and deterministic nearest-panorama selection. Preserve the existing public Street View window/viewpoint contracts; do not call Google coverage/metadata APIs or require an API key.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Typed local coverage manifest asset is optional and package-path safe.
- [x] #2 Nearest panorama selection is deterministic and viewport-scoped.
- [x] #3 Existing packages without coverage remain valid and return empty coverage.
- [x] #4 Focused TypeScript and Rust tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Extend the local package manifest contract with an optional package-relative Street View coverage asset, preserving compatibility for existing packages.
2. Add `src/basemapPreview/streetViewCoverage.ts` with typed segment/panorama payloads, safe normalization, viewport filtering, local reader loading, and deterministic nearest-panorama selection.
3. Wire local package asset validation so a declared coverage asset is verified before the adapter is used.
4. Extend the Rust manifest schema/contract and builder inputs so packages can declare/copy the optional coverage asset without introducing a Google dependency.
5. Add focused TypeScript and Rust tests for valid/invalid coverage payloads, nearest selection, empty/no-asset behavior, path safety, and manifest round-tripping.
6. Run focused frontend/Rust tests and typechecks, then validate this task.

Coverage: AC-2, AC-3, AC-4, AC-10, AC-11, AC-13, AC-14.
Risks: Existing manifests must remain valid; optional coverage asset is intentionally absent from the current example package, so no-data behavior remains explicit until a package supplies real Street View data.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Using kn-flow sequential schedule. Existing parent rewrite timer remains active; not stopped or repurposed.
Paused by revised product decision: coverage is local-only; Google public Street View is used only by the existing viewing window. Spec returned to draft/review-required because locked decisions D8/D18 changed. No source code implemented.
Resumed after approved spec revision. Sequential flow; local-only coverage implementation.
Review: PASS — no P1/P2 findings. Verification: npm run typecheck; focused Vitest 2 files/9 tests; cargo test -p basemap_contract -p basemap_builder; cargo clippy -p basemap_contract -p basemap_builder --all-targets -- -D warnings; git diff --check. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass. System Decision Impact: candidate @decision/20260813-0011-optional-local-street-view-coverage-asset-in-preview-packages (added) — optional local coverage asset contract with backward-compatible omission.
Task completed; source implementation verified and reviewed.
System Decision Impact: candidate @decision/20260813-0011-optional-local-street-view-coverage-asset-in-preview-packages (added) — optional local coverage asset contract with backward-compatible omission.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass
<!-- SECTION:NOTES:END -->

