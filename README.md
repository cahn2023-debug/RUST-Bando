# RUST repository entrypoint

The active standalone Vietnam Basemap workspace is
[`vietnam-basemap-preview/`](vietnam-basemap-preview/). It contains the
read-only desktop preview and the reusable Vietnam Basemap Platform crates,
assets, contracts, styles and release documentation.

Run the workspace directly:

```bash
cd vietnam-basemap-preview
npm install
npm run dev
npm run check
```

Root convenience commands delegate to that workspace:

```bash
npm run dev:basemap-preview
npm run build:basemap-preview
npm run build:basemap-preview-debug
npm run verify:basemap-preview
npm run check
```

Debug EXE/PDB files are written to `dist/basemap-preview-debug/`. Existing
unrelated artifacts in `dist/` are preserved.

The former application source is archived at
`BAK/archive/2026-08-12/vietnam-basemap-preview-workspace-consolidation/`.
See its manifests for SHA-256-based rollback verification. The old active
`vietnam-basemap/` workspace and root application source directories are no
longer active.

Project architecture and historical material remain under `docs/` and
`BAK/`; they are not part of the standalone preview workspace.
