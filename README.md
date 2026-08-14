# RUST workspace

The repository root is the canonical workspace. Active first-party code is organized by software tab and responsibility:

- `apps/project-manager/` — React/Vite + Tauri v2 desktop application.
- `apps/graph-viewer/` — Bando knowledge-graph viewer.
- `apps/apps-script/pmp-collaboration/` — Google Apps Script integration.
- `tools/sol-advisor/` — validation/orchestration tool with its nested Git boundary.
- `packages/` — shared code only after reuse by at least two tabs is proven.
- `data/` — canonical shared data hub; see [data/README.md](data/README.md).

Run Project Manager from the repository root:

```bash
npm run dev
npm run tauri dev
npm run typecheck
npm run check
```

Root commands delegate to `apps/project-manager/`. Dependencies, generated output, repository metadata, and archive material are excluded from the active-code migration and remain untracked or outside the first-party source set. Migration evidence and rollback mappings are recorded under `data/manifests/`; historical source snapshots remain under `BAK/`.
