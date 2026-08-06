# Directory Map

Last audited: 2026-08-05

## Product Code

| Path | Role | Status |
| --- | --- | --- |
| `src/` | Frontend app source. | ACTIVE |
| `src/core/` | Shared frontend runtime areas, including basemap. | ACTIVE |
| `src/modules/home/` | App shell, bootstrap, dashboard, workspace. | ACTIVE |
| `src/modules/design/` | Design UI, map features, palette/CAD UI. | ACTIVE |
| `src/modules/implement/` | Project management, auth/settings/layout stores, services. | ACTIVE |
| `src/modules/contract/` | Contract/domain types and views. | ACTIVE |
| `src/shared/` | Shared frontend utilities and components. | ACTIVE |
| `src-tauri/` | Tauri/Rust backend. | ACTIVE |
| `src-tauri/src/domain/` | Backend domain modules and commands. | ACTIVE |
| `src-tauri/crates/` | Rust workspace crates. | ACTIVE |

## Documentation And Planning

| Path | Role | Status |
| --- | --- | --- |
| `docs/INDEX.md` | Main documentation gateway. | ACTIVE |
| `docs/context-pack/` | Current compact project context. | ACTIVE |
| `docs/architecture/` | Architecture docs, mixed freshness. | NEEDS_REVIEW |
| `docs/specs/` | Focused feature specs. | NEEDS_REVIEW |
| `specs/` | Speckit feature specs. | ACTIVE/NEEDS_REVIEW |
| `.planning/` | Historical project planning. | STALE |
| `docs/plans/` | Historical/commercial/refactor plans. | STALE |
| `docs/reports/` | Bug/audit/completion reports. | ARCHIVE_CANDIDATE |
| `docs/archive/` | Existing archive. | ARCHIVE_CANDIDATE |
| `docs/troubleshoot/` | Historical troubleshooting logs. | ARCHIVE_CANDIDATE |

## Generated, Reference, Or Support Areas

| Path | Role | Status |
| --- | --- | --- |
| `.agent/` | Agent library/reference forest, thousands of docs. | ARCHIVE_CANDIDATE |
| `.agents/` | Local agent skills. | NEEDS_REVIEW |
| `.brain/` | Generated/project memory style artifacts. | ARCHIVE_CANDIDATE |
| `.knowns/` | Knowns database/artifacts. | NEEDS_REVIEW |
| `.specify/` | Speckit configuration/templates. | NEEDS_REVIEW |
| `Resources/references/para-workspace/` | External/reference docs. | ARCHIVE_CANDIDATE |
| `bando-graph-viewer/` | Separate graph viewer/reference area. | NEEDS_REVIEW |
| `BAK/` | Backup/old material. | ARCHIVE_CANDIDATE |
| `dist/`, `node_modules/`, `.codegraph/`, `.git/` | Build, dependency, index, VCS internals. | Out of audit docs |

