---
id: eou1qn
title: "[project-directory-cleanup-01] Inventory and classify code"
status: done
priority: medium
labels:
  - from-spec
  - spec:project-directory-cleanup
createdAt: '2026-08-14T06:32:17.925Z'
updatedAt: '2026-08-14T06:39:19.041Z'
completedAt: '2026-08-14T06:34:28.291Z'
timeSpent: 113
assignee: '@me'
spec: specs/2026-08-14/project-directory-cleanup
fulfills:
  - AC-1
  - AC-2
  - AC-4
order: 10
---
# [project-directory-cleanup-01] Inventory and classify code

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Inventory the entire workspace, discover every project entry point and manifest, classify active code, unused code, and protected dependency/tooling/cache/artefact paths. Do not move files in this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Inventory covers the entire workspace and records all project entry points and manifests.
- [x] #2 Active code is identified from references used by every workspace project.
- [x] #3 Candidate moves and protected exclusions are recorded for the next task.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Enumerate project manifests, entry points, source directories, and protected paths. 2. Trace references from every project entry point. 3. Produce the candidate and exclusion inventory for task 02.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Started per approved spec. Spec Decision Compliance pending until implementation and verification.
Inventory complete. Active entry points: root package.json -> BAK/archive/2026-08-12/vietnam-basemap-preview-workspace-consolidation/legacy-application; bando-graph-viewer/package.json -> out/extension.js with src build inputs; sol-advisor/package.json -> tools and plugin code; apps-script/pmp-collaboration/appsscript.json -> Code.gs. Protected by D6: dependency/tooling/cache/artefact roots including TOOL, agent directories, Resources, docs, specs, scratch, graphify-out, coverage, node_modules, .venv, .codegraph, .knowns, and existing BAK archive. Candidate: knowledge-graph.bat only; scripts/graph_generator.py is absent and no references were found. Existing deleted git paths remain absent; README.md and package.json are active/config changes. System Decision Impact: none — inventory only. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass
<!-- SECTION:NOTES:END -->

