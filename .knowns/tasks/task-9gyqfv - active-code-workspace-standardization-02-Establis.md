---
id: 9gyqfv
title: "[active-code-workspace-standardization-02] Establish canonical folders and data hub"
status: done
priority: high
labels:
  - from-spec
  - spec:active-code-workspace-standardization
  - spec-date:2026-08-14
createdAt: '2026-08-14T07:47:45.701Z'
updatedAt: '2026-08-14T08:54:24.014Z'
completedAt: '2026-08-14T07:54:25.009Z'
timeSpent: 128
assignee: '@me'
spec: specs/2026-08-14/active-code-workspace-standardization
fulfills:
  - AC-2
  - AC-5
  - AC-6
---
# [active-code-workspace-standardization-02] Establish canonical folders and data hub

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the canonical apps, packages, tools, and data layout and establish the data hub subdirectories, ownership rules, and Git tracking policy without moving active source yet.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Canonical app/tool directories and data hub subdirectories exist with documented ownership.
- [x] #2 Git tracking rules distinguish manifests/schema/metadata/samples from generated or large data.
- [x] #3 packages contains only proven cross-tab shared code or an explicit empty baseline.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Create the canonical `apps/`, `packages/`, `tools/`, and seven `data/` subdirectories without moving any existing source tree.
2. Add concise ownership/readme markers: apps hold product tabs, tools hold operational utilities, packages remain empty until cross-tab reuse is proven, and data is coordinated through manifests/schemas/samples versus generated data areas.
3. Update `.gitignore` with minimal data-hub rules: keep manifests, schemas, and samples trackable; ignore contents of raw, normalized, exports, and runtime except directory placeholders. Preserve existing BAK and legacy source exclusions.
4. Record nested repository boundaries for `bando-graph-viewer` and `sol-advisor` in the ownership documentation so later moves do not flatten or overwrite their `.git` histories.
5. Validate directory existence, ignore/track behavior, and `packages` empty-baseline status; append Spec Decision Compliance D1–D12 and `System Decision Impact: none` because this task establishes implementation scaffolding, not a new durable runtime decision.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented canonical scaffolding: apps/{project-manager,graph-viewer,apps-script}, packages, tools/sol-advisor, and data/{manifests,schemas,raw,normalized,exports,runtime,samples}. Added ownership markers and data/README.md. Updated .gitignore so manifests/schemas/samples remain trackable while raw/normalized/exports/runtime contents are ignored except placeholders. Nested Git boundaries for Graph Viewer and Sol Advisor are documented; no source was moved.

System Decision Impact: none — this is scaffolding and tracking policy within the approved spec; no new runtime guidance was introduced.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass.
Verification: all canonical directories exist; ignore behavior matches policy; packages has only README baseline; git diff --check passed.
Review: PASS. No P1/P2 findings. Canonical markers, data policy, ignore behavior, nested-repo documentation, and packages empty baseline are substantive and consistent with the spec.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
<!-- SECTION:NOTES:END -->

