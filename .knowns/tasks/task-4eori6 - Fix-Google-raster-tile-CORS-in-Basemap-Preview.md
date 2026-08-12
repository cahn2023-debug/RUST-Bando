---
id: 4eori6
title: 'Fix: Google raster tile CORS in Basemap Preview'
status: done
priority: high
labels:
  - bugfix
  - basemap-preview
  - cors
createdAt: '2026-08-12T14:03:11.570Z'
updatedAt: '2026-08-12T14:22:02.341Z'
completedAt: '2026-08-12T14:22:02.341Z'
timeSpent: 1004
assignee: '@me'
---
# Fix: Google raster tile CORS in Basemap Preview

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Runtime bug: Google Street/Hybrid raster tiles are requested directly from the Tauri webview and blocked by browser CORS. Add a preview-only localhost tile proxy, route frontend Google tile templates through it, preserve the fixed upstream Google template and no-fallback policy, and verify packaged/dev preview behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Google tile requests no longer fail browser CORS in Tauri/dev because they route through the preview proxy.
- [x] #2 Google Hybrid uses the currently working lyrs=y upstream tile shape; satellite lyrs=s is not requested at high zoom where Google returns 404.
- [x] #3 Proxy rejects arbitrary hosts/parameters and preserves no-fallback/error-only behavior.
- [x] #4 Frontend, Rust/Tauri, debug build, and smoke verification pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the reported CORS failure path and confirm direct Google raster templates are loaded from the Tauri webview.
2. Add a preview-only localhost Google tile proxy with strict host/parameter validation, CORS response headers, and no arbitrary URL forwarding.
3. Route Google Street/Hybrid templates through the proxy in Tauri/package mode and Vite dev proxy mode; keep the locked upstream Google template and no-fallback behavior.
4. Add Rust/frontend tests for tile proxy validation/template generation and run typecheck, Vitest, build, Tauri checks, and smoke verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Debug classification: runtime/integration failure. Root cause: googleSource.ts sent Google raster URLs directly from the Tauri webview; Google did not return Access-Control-Allow-Origin, and lyrs=s additionally returns 404 for the high-zoom tiles requested over Vietnam. Fix: added strict localhost Google tile proxy in src-tauri using reqwest, routed dev/Tauri templates through it, preserved apistyle on updates, and switched Hybrid from lyrs=s + labels to working lyrs=y. Added strict Rust query tests and smoke verifier assertions. Direct upstream checks: lyrs=m/h/y returned image tiles; lyrs=s returned 404 at z>=12. Official Google Map Tiles documentation confirms authenticated Map Tiles API is the supported current API; no API key was added because the approved preview-only/no-production-fallback constraints remain. System Decision Impact: none — this is a bug fix within existing preview-only source policy.
Review: PASS — strict proxy validation prevents arbitrary URL forwarding; frontend/dev/Tauri wiring is complete; no P1/P2 findings; diagnostics clean.
Verification: 42 Vitest tests passed; 7 Tauri Rust tests passed; TypeScript typecheck passed; Vite build passed; cargo fmt/check/test passed; debug EXE/PDB build passed; smoke verifier passed; root npm run check passed; task validation clean.
Root cause confirmed: direct Google tile requests from Tauri webview caused CORS errors; lyrs=s returned 404 at high zoom. Fix confirmed: localhost proxy + preserved apistyle + Hybrid lyrs=y.
<!-- SECTION:NOTES:END -->

