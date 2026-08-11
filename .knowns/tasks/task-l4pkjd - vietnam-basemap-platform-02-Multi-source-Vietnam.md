---
id: l4pkjd
title: "[vietnam-basemap-platform-02] Multi-source Vietnam data pipeline"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-platform
  - spec-date:2026-08-11
createdAt: '2026-08-11T06:37:16.759Z'
updatedAt: '2026-08-11T07:42:34.584Z'
completedAt: '2026-08-11T06:56:56.279Z'
timeSpent: 295
assignee: '@me'
spec: specs/2026-08-11/vietnam-basemap-platform
fulfills:
  - AC-1
  - AC-2
order: 20
---
# [vietnam-basemap-platform-02] Multi-source Vietnam data pipeline

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Xây pipeline build basemap hỗ trợ OSM mặc định và nhiều source cấu hình được, bao phủ Việt Nam cùng vùng đệm và các lớp dữ liệu MVP.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Khai báo và chọn được OSM làm source mặc định cùng source bổ sung qua cấu hình.
- [x] #2 Build được package có coverage Việt Nam + vùng đệm và các lớp dữ liệu D4.
- [x] #3 Thêm validation/fixture xác nhận source selection, coverage và layer inventory.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Add a `basemap_builder` crate to the standalone workspace and document the pipeline input/output contract.
   - Keep builder code under `vietnam-basemap/crates/basemap_builder/` and configuration examples under `vietnam-basemap/builder/config/`.
   - Do not modify the existing application pipeline or add project-domain data.

2. Implement multi-source pipeline configuration and validation.
   - Deserialize a config with a required `osm` default source, additional source metadata, Vietnam + buffer coverage, and the D4 layer inventory.
   - Reject missing default source, duplicate source IDs, invalid coverage, incomplete required layers, or unsupported package metadata.

3. Implement deterministic release packaging from prepared source artifacts.
   - Accept a prepared tile archive, style files, font files, and sprite files as inputs.
   - Copy them into a versioned release directory, generate the shared manifest, and refuse to overwrite an existing version.
   - Use a staging directory and atomic rename so a partial package is not published as a complete release.

4. Add example configuration and pipeline tests.
   - Test OSM + supplemental source selection, all required layers, coverage validation, immutable version output, manifest generation, and package contents.
   - Use small temporary fixture files; actual OSM/Planetiler downloads remain operator inputs and are not checked into the repository.

5. Verify and complete the task.
   - Run fmt, check, test, clippy and task validation.
   - Append System Decision Impact and D1–D13 compliance notes before stopping the timer and marking the task done.

### Plan check

- AC coverage: AC-1 is covered by steps 2–4; AC-2 is covered by steps 2 and 4.
- Scope: pipeline configuration/orchestration and deterministic packaging; no real Vietnam PBF download or tile-generation binary is committed.
- Dependency: consumes `basemap_contract` from task 01; task 03 can consume the generated package layout.
- Risk: external data/build tools are operator-provided; tests use fixtures to remain deterministic.
- Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan drafted from @doc/specs/2026-08-11/vietnam-basemap-platform; consumes task eudf3a contract.
Implemented basemap_builder workspace crate and CLI with multi-source config, OSM default enforcement, supplemental source support, D4 layer inventory validation, Vietnam buffered coverage, deterministic artifact packaging, staging/atomic publish, and immutable version guard.
Verification: cargo fmt --check, cargo check, cargo test (3 builder tests + 6 contract tests), cargo clippy --all-targets -- -D warnings, and git diff --check passed.
Review: PASS; no P1/P2 findings. Actual OSM/Planetiler inputs remain operator-provided; fixture tests keep the pipeline deterministic.
System Decision Impact: candidate @decision/20260811-1311-standalone-vietnam-basemap-platform-and-release-contract (added) — extended the standalone platform with multi-source build and immutable package publication behavior; candidate remains draft.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass
<!-- SECTION:NOTES:END -->

