---
id: idc190
title: "[google-public-street-view-coverage-overlay-fallback-01] Public Google coverage adapter"
status: done
priority: high
labels:
  - from-spec
  - spec:google-public-street-view-coverage-overlay-fallback
  - spec-date:2026-08-13
createdAt: '2026-08-13T01:52:34.476Z'
updatedAt: '2026-08-13T02:13:52.941Z'
completedAt: '2026-08-13T02:02:39.800Z'
timeSpent: 543
assignee: '@me'
spec: specs/2026-08-13/google-public-street-view-coverage-overlay-fallback
fulfills:
  - AC-1
  - AC-2
  - AC-4
  - AC-9
  - AC-10
order: 10
---
# [google-public-street-view-coverage-overlay-fallback-01] Public Google coverage adapter

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tạo boundary best-effort cho nguồn Google public không API key; parse payload thành segments/panoramas, xử lý lỗi/rỗng/không hợp lệ, không persist/index coverage và giữ package offline/local không cần asset coverage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Public coverage adapter is isolated behind a replaceable boundary and never requires an API key.
- [x] #2 Valid fixture data normalizes into viewport coverage segments and panoramas.
- [x] #3 Empty, unavailable, and malformed responses produce safe empty/error results without persistence.
- [x] #4 Focused adapter tests and TypeScript validation pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a replaceable public-coverage adapter boundary that accepts a viewport and returns normalized Street View segments/panoramas without API keys or durable storage.
2. Implement defensive parsing/normalization for the selected best-effort response shape, treating missing, empty, malformed, or unavailable responses as empty coverage/errors that callers can handle silently.
3. Add deterministic unit fixtures/tests for valid, empty, malformed, and no-key behavior; keep the existing local package contract backward-compatible.
4. Run focused TypeScript tests/typecheck and validate the task before handoff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review: PASS — no P1/P2 findings in adapter scope. Implemented replaceable public Google coverage boundary with keyless JSONP browser transport (CORS-safe), injectable fetcher for tests/proxy, defensive JSONP parsing, viewport sampling, dedupe, timeout/abort and in-memory-only normalized coverage. Verification: npm run typecheck; npm test (13 files, 53 tests); git diff --check. System Decision Impact: candidate @decision/20260813-0843-best-effort-google-public-street-view-coverage-in-preview (added) — preview-only undocumented Google coverage adapter and fallback boundary. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
<!-- SECTION:NOTES:END -->

