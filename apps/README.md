# Active application tabs

First-party software tabs live under this directory:

- `project-manager/` — the Tauri desktop application.
- `graph-viewer/` — the Bando knowledge-graph viewer.
- `apps-script/` — Google Apps Script integrations.

Keep each tab's manifest, tests, build configuration, and app-specific code inside its own directory. Dependencies, generated output, caches, and archive snapshots are excluded from active-source manifests and must remain untracked.
