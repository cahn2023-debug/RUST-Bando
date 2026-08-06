# Known Issues

Last audited: 2026-08-05

## Documentation Issues

- Many Vietnamese docs have mojibake/encoding damage. Do not rewrite them during
  unrelated tasks; classify and repair only when asked.
- `docs/AGENTS.md` pointed to root `KNOWNS.md`, but the actual file is
  `docs/KNOWNS.md`.
- `docs/KNOWNS.md` says `docs/project_index.html` is the SSOT. This audit adds
  `docs/INDEX.md` as the readable gateway; `project_index.html` needs review.
- Several overview/architecture docs describe Leaflet-only map architecture,
  while source currently shows a persistent basemap host and MapLibre-oriented
  renderer.
- Large generated files (`docs/NOTEBOOK_LM_SOURCE.md`,
  `docs/NOTEBOOK_LM_V2.md`, `docs/udnl_upload.md`,
  `docs/architecture/CODEBASE_MAP.md`) are not suitable for normal agent
  startup.
- There are many plan/report variants with overlapping names. Use
  `DOCUMENT_STATUS.md` before trusting them.

## Source/Worktree Observations

- The worktree already had many uncommitted source changes before this audit.
  This audit intentionally does not modify or revert those source files.
- Current dirty areas point to active basemap/map UI work and Tauri storage
  integration. Treat docs about map UI and basemap as moving targets.
- CodeGraph is present via `.codegraph/`; use it before manual code search for
  architecture or implementation questions.

## Follow-Up Cleanup Candidates

- Decide whether `docs/project_index.html` remains generated SSOT or becomes an
  archive artifact behind `docs/INDEX.md`.
- Consolidate duplicate audit/report docs under `docs/reports/`.
- Archive older polyline, point-selection, theme, and upgrade completion logs.
- Repair encoding in active Vietnamese docs only after selecting canonical files.

