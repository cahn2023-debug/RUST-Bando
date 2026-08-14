---
id: 9ba20i
title: "[project-directory-cleanup-02] Move unused code to BAK"
status: done
priority: medium
labels:
  - from-spec
  - spec:project-directory-cleanup
createdAt: '2026-08-14T06:32:18.138Z'
updatedAt: '2026-08-14T06:39:19.559Z'
completedAt: '2026-08-14T06:36:02.222Z'
timeSpent: 93
assignee: '@me'
spec: specs/2026-08-14/project-directory-cleanup
fulfills:
  - AC-3
  - AC-5
  - AC-6
order: 20
---
# [project-directory-cleanup-02] Move unused code to BAK

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move approved unused source files and wholly-unused source directories to BAK/2026-08-14/<original-relative-path>, preserve hashes, avoid collisions, and write the old/new path manifest. Preserve current git content and do not restore deleted files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every moved code item is placed under BAK/2026-08-14 with its original relative path.
- [x] #2 No destination is overwritten and the manifest records path, reason, hash, and status.
- [x] #3 Dependencies, tooling, cache, artefacts, active code, and deleted working-tree paths remain protected.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Review task 01 inventory and resolve only explicit classification gaps. 2. Create the dated BAK destination and move candidates without overwrite. 3. Verify hashes and record the complete old/new path manifest.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Started after task eou1qn inventory. Spec Decision Compliance pending implementation.
Implementation complete: moved knowledge-graph.bat to BAK/2026-08-14/knowledge-graph.bat. Source is absent, destination exists, and SHA-256 matches 3AEC0AF78D8A31ED8A887775E5053DAA43A7038BCC178C1A8E5E73DA653AF1F8. Manifest: BAK/2026-08-14/MANIFEST.md. No destination collision; no dependency/tooling/cache/artefact or active code moved; existing deleted git paths were untouched. System Decision Impact: none — reversible file organization only. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass
<!-- SECTION:NOTES:END -->

