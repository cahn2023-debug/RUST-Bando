# System Registry

Last audited: 2026-08-05

## Frontend Systems

| System | Source anchors | Notes |
| --- | --- | --- |
| App shell | `src/modules/home/App.tsx` | Owns top toolbar, ribbon, status bar, workspace grid, tab switching. |
| Bootstrap/auth gate | `src/modules/home/AppBootstrap.tsx`, `src/modules/implement/stores/useAuthStore.ts` | Shows loader until auth is initialized. |
| Project management | `src/modules/implement/features/project-management/` | Home dashboard, project detail, project open/close/delete flows. |
| Design/map workspace | `src/modules/design/`, `src/modules/design/features/map/` | Active map and CAD/palette UI. |
| Persistent basemap | `src/core/basemap/` | Current work area; source tree has uncommitted basemap changes. |
| Layout/palettes | `src/modules/implement/stores/useLayoutStore.ts`, design UI components | Controls panels and visible workspace tools. |
| Accessibility helpers | `src/modules/tool/utils/accessibility` | Used for UI announcements. |
| Report export | `docs/WORD_REPORT_EXPORT_FEATURE.md`, `specs/002-word-report-export/` | Active docs/spec set; verify against implementation before changing. |

## Backend Systems

| System | Source anchors | Notes |
| --- | --- | --- |
| Tauri app | `src-tauri/src/main.rs`, `src-tauri/src/lib.rs` | Desktop shell and command registration. |
| Implementation domain | `src-tauri/src/domain/implement/` | Main backend domain area. |
| V2 storage pipeline | `src-tauri/src/domain/implement/modules/v2/` | `.pmp`, events, snapshots, map tiles, media, backups. |
| Storage worker | `worker_storage.rs` | Serializes and batches storage commands. |
| Rust workspace crates | `src-tauri/crates/*` | App domain, GIS, P2P, shared kernel, GIS engine. |
| Build/package | `src-tauri/Cargo.toml`, `tauri.conf.json`, `build_release_msi.*` | Tauri and Windows/MSI build path. |

## Documentation Systems

| System | Canonical path | Notes |
| --- | --- | --- |
| Documentation gateway | `docs/INDEX.md` | Read first for large tasks. |
| Agent guidance | `docs/AGENTS.md`, `docs/KNOWNS.md` | Compatibility entrypoint plus canonical operating guidance. |
| Context pack | `docs/context-pack/` | Current compact map of project state. |
| Speckit specs | `specs/` | Feature-level specs and plans. |
| Historical reports | `docs/reports/`, `docs/troubleshoot/`, `docs/archive/` | Useful for archaeology, not startup context. |

