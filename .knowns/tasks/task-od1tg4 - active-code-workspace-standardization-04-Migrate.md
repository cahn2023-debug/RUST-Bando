---
id: od1tg4
title: "[active-code-workspace-standardization-04] Migrate supporting apps and tools"
status: done
priority: high
labels:
  - from-spec
  - spec:active-code-workspace-standardization
  - spec-date:2026-08-14
createdAt: '2026-08-14T07:47:45.810Z'
updatedAt: '2026-08-14T08:54:25.311Z'
completedAt: '2026-08-14T08:04:14.109Z'
timeSpent: 249
assignee: '@me'
spec: specs/2026-08-14/active-code-workspace-standardization
---
# [active-code-workspace-standardization-04] Migrate supporting apps and tools

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move Graph Viewer, Apps Script, and Sol Advisor into their canonical app/tool paths, classify any truly shared modules, and update their local manifests and references without touching unrelated tooling or archives.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Graph Viewer, Apps Script, and Sol Advisor resolve from their canonical paths.
- [x] #2 Only evidence-backed cross-tab modules enter packages.
- [x] #3 Unrelated root tooling, metadata, dependencies, generated output, and archives remain in place.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Freeze source/target boundaries and record nested repository status for `bando-graph-viewer` and `sol-advisor`; verify canonical target directories are empty and within the workspace.
2. Move Graph Viewer contents into `apps/graph-viewer`, preserving its nested `.git` directory while excluding `node_modules` and compiled `out` output; capture SHA-256 entries for moved files.
3. Move Sol Advisor contents into `tools/sol-advisor`, preserving its nested `.git` directory and excluding dependency/generated output if present; capture SHA-256 entries.
4. Move tracked Apps Script with `git mv` into `apps/apps-script/pmp-collaboration`, preserving parent-repository history and manifest structure.
5. Write `data/manifests/supporting-apps-migration-2026-08-14.json`, verify hashes, nested repo boundaries, canonical manifests/entrypoints, unchanged packages baseline, and excluded old/dependency/artifact paths.
6. Run targeted local checks where available (Graph Viewer compile, Sol Advisor test/validate, Apps Script manifest parse), validate the task, and append Spec Decision Compliance D1–D12 plus `System Decision Impact: none`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Moved supporting surfaces: Graph Viewer active files to apps/graph-viewer while preserving nested .git and leaving node_modules/out in the old ignored source; Sol Advisor to tools/sol-advisor while preserving nested .git; tracked Apps Script moved with git mv to apps/apps-script/pmp-collaboration. Manifest: data/manifests/supporting-apps-migration-2026-08-14.json (68 files, hash verified).

Verification: Graph Viewer dependency install from lockfile with legacy-peer-deps was required because root npm resolution exposed a peer conflict; target npm run compile passed. Apps Script appsscript.json parsed successfully. Nested repo roots resolve at canonical paths and Sol Advisor remains clean. Sol Advisor validate/release-check and full bun test remain baseline blockers: vendored schema digest/frontmatter failures, Windows temp Bun fixture failures, and Unix permission assumptions; no source changes were made to fix them.
System Decision Impact: none — this applies approved layout and preserves nested repository boundaries without adding new runtime guidance.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass.
Review: PASS after reverting the npm-generated package-lock working-tree rewrite. No P1/P2 findings remain. Nested Git roots resolve at canonical paths, 68/68 hashes match, excluded dependency/output paths remain outside the moved source, and Apps Script rename is staged with zero content changes.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass
<!-- SECTION:NOTES:END -->

