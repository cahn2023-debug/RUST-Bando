---
id: 5n9tjd
title: "[vietnam-basemap-platform-07] MapLibre client integration và operational docs"
status: done
priority: medium
labels:
  - from-spec
  - spec:vietnam-basemap-platform
  - spec-date:2026-08-11
createdAt: '2026-08-11T06:37:16.968Z'
updatedAt: '2026-08-11T07:42:41.989Z'
completedAt: '2026-08-11T07:40:46.336Z'
timeSpent: 1480
assignee: '@me'
spec: specs/2026-08-11/vietnam-basemap-platform
fulfills:
  - AC-9
  - AC-10
order: 70
---
# [vietnam-basemap-platform-07] MapLibre client integration và operational docs

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tích hợp contract vào boundary MapLibre hiện tại và ghi lại vận hành online/offline, release, attribution responsibility và rollback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Client dùng typed adapter/BasemapRuntime boundary thay vì truy cập file hoặc provider trực tiếp.
- [x] #2 Chứng minh client chuyển được giữa online API và offline package theo manifest/version contract.
- [x] #3 Cập nhật tài liệu vận hành và verification checklist cho release/rollback.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Add a typed TypeScript Vietnam Basemap client adapter under `src/core/basemap/`.
   - Model the shared manifest fields needed by the client.
   - Support online service URLs and offline package-base URLs through the same manifest/version contract.
   - Provide manifest validation, style/tile/font/sprite URL resolution, and a fetch helper for the online manifest endpoint.

2. Integrate the adapter at the existing BasemapRuntime boundary.
   - Add an optional provider configuration to `BasemapRuntimeConfig`.
   - When configured, MapLibre receives the provider style URL; default behavior continues using the existing runtime path.
   - Skip the existing external tile prefetch/cache path for the provider mode and preserve the current default runtime unchanged.

3. Add client and runtime contract tests.
   - Verify online and offline URL resolution, default-style selection, manifest compatibility, fetch failures, and no direct provider/file access from callers.
   - Verify the runtime config remains backward-compatible and provider style wiring is passed to MapLibre.

4. Add operational documentation through Knowns.
   - Document online/offline setup, manifest/version compatibility, attribution responsibility, manual validate/activate/rollback workflow, and the current app adapter boundary.
   - Reference the standalone package/service docs without duplicating implementation details.

5. Verify and complete the task.
   - Run targeted tests/typecheck/lint, then the full frontend gate and standalone Rust workspace checks.
   - Append System Decision Impact and D1–D13 compliance notes before stopping the timer and marking the task done.

### Plan check

- AC coverage: AC-9 is covered by steps 1–3; AC-10 is covered by steps 1, 3 and 4.
- Scope: opt-in current-client integration and operational docs; existing default Google/runtime behavior is preserved until a provider is configured.
- Dependency: consumes the standalone contract/service/offline/release tasks 01–06.
- Risk: frontend map runtime has high blast radius; changes are limited to typed config/style selection and isolated tests.
- CodeGraph status: auto-sync is disabled due a file lock; current target files were confirmed by direct reads before planning.
- Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan drafted from @doc/specs/2026-08-11/vietnam-basemap-platform; existing MapLibre runtime files were directly confirmed after CodeGraph sync became unavailable.
Implemented typed VietnamBasemapClient online/offline adapter with manifest validation, style/tile/font/glyph/sprite URL resolution, style document loading, and package placeholder resolution before MapLibre receives the style. Integrated the opt-in provider at BasemapRuntime; legacy default basemap behavior, service worker, prefetch/cache, and preset path remain unchanged when no provider is configured. Added runtime/client tests for online and offline contract resolution, style placeholder resolution, provider wiring, and safe manifest paths. Updated Knowns architecture doc with client boundary, release operations, verification checklist, and operator attribution responsibility. Fixed the integration gap where raw package placeholders would otherwise be passed to MapLibre. Verification: targeted adapter/runtime tests 13 passed; core basemap suite 32 passed; npm run check:frontend passed (encoding, boundaries, typecheck, lint, tests/coverage, build); cargo fmt --all --check, cargo check --workspace --all-targets, cargo test --workspace, and cargo clippy --workspace --all-targets -- -D warnings passed. Review: PASS; no P1/P2 findings. System Decision Impact: candidate @decision/20260811-1311-standalone-vietnam-basemap-platform-and-release-contract (changed) — extended the shared platform guidance with the typed MapLibre adapter and online/offline style URL resolution boundary; candidate remains draft and is linked to this task/spec/source doc. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass
<!-- SECTION:NOTES:END -->

