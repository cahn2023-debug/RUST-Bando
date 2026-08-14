# Project Manager repository entrypoint

The active Project Manager source snapshot is kept at
`BAK/archive/2026-08-12/vietnam-basemap-preview-workspace-consolidation/legacy-application/`.
It contains the React/Vite frontend, Tauri v2 shell and Rust backend.

Run Project Manager from the repository root:

```bash
npm run dev
npm run tauri dev
npm run typecheck
npm run check
```

Root commands delegate to the Project Manager snapshot. The standalone
Vietnam Basemap preview is no longer the root application entrypoint.

The archive is preserved as-is because it contains the source snapshot and
its rollback manifests. Generated desktop output remains under `dist/`.
