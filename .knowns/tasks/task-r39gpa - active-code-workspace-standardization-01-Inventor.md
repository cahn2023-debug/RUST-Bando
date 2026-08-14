---
id: r39gpa
title: "[active-code-workspace-standardization-01] Inventory and resolve active source roots"
status: done
priority: high
labels:
  - from-spec
  - spec:active-code-workspace-standardization
  - spec-date:2026-08-14
createdAt: '2026-08-14T07:47:45.539Z'
updatedAt: '2026-08-14T08:54:23.491Z'
completedAt: '2026-08-14T07:52:03.019Z'
timeSpent: 198
assignee: '@me'
spec: specs/2026-08-14/active-code-workspace-standardization
fulfills:
  - AC-1
  - AC-9
---
# [active-code-workspace-standardization-01] Inventory and resolve active source roots

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Inventory the workspace entrypoints, manifests, scripts, references, and exclusions. Resolve the actual Project Manager runtime/build source before any move, and record the evidence in the migration manifest.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All four first-party surfaces and their entrypoints/manifests are inventoried.
- [x] #2 The Project Manager source-of-truth is resolved from runtime/build evidence.
- [x] #3 Excluded root metadata, dependency, cache, artifact, and archive paths are recorded without modification.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Capture the current worktree baseline and enumerate root control/tooling, archive, dependency, cache, artifact, and source-like directories without changing them.
2. Inspect root and nested manifests/scripts/entrypoints for Project Manager, Graph Viewer, Apps Script, and Sol Advisor; run read-only command/manifest checks to establish the actual Project Manager runtime/build source.
3. Record the inventory in `data/manifests/active-code-inventory-2026-08-14.json`, including surface, source root, entrypoints, manifest paths, active evidence, exclusions, and unresolved references.
4. Validate that the inventory is internally consistent, that the Project Manager source decision is explicit, and that the only worktree addition is the inventory artifact.
5. Append task notes with Spec Decision Compliance for D1–D12 and `System Decision Impact: candidate` only if the inventory establishes durable canonical source guidance; otherwise record `none`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented inventory artifact: data/manifests/active-code-inventory-2026-08-14.json.

Evidence: root package.json and README delegate Project Manager commands to BAK/archive/2026-08-12/vietnam-basemap-preview-workspace-consolidation/legacy-application; npm run typecheck passed through that delegate. Graph Viewer, Apps Script, and Sol Advisor manifests/entrypoints were recorded. Excluded root metadata, tooling, dependencies, caches, artifacts, docs, specs, and archives were recorded without moving them. No source tree was moved.

System Decision Impact: candidate @decision/20260814-1450-runtime-source-selection-precedes-active-code-migration (added) — runtime/build evidence selects the Project Manager source before migration; candidate remains draft pending integrated migration verification.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass.
Verification: inventory JSON parses; target/source paths exist; git diff --check passed; root npm run typecheck passed.
Review P2: excludedRoots listed BAK/archive while the verified Project Manager source is nested below it; reopened to add an explicit exception.
Review fix: added excludedRootExceptions so the verified Project Manager source under BAK/archive is explicitly included despite the surrounding archive exclusion. Revalidated JSON, source/exception consistency, and git diff --check.
Review verdict: PASS after P2 fix; no P1/P2 findings remain.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
<!-- SECTION:NOTES:END -->

