# Directory Map

Last audited: 2026-08-14

## Product Code

| Path | Role | Status |
| --- | --- | --- |
| `apps/project-manager/` | Project Manager tab, including React/Vite and Tauri/Rust code. | ACTIVE |
| `apps/project-manager/src/` | Project Manager frontend source. | ACTIVE |
| `apps/project-manager/src-tauri/` | Project Manager Tauri/Rust backend and workspace crates. | ACTIVE |
| `apps/graph-viewer/` | Bando knowledge-graph viewer tab. | ACTIVE |
| `apps/apps-script/pmp-collaboration/` | Google Apps Script integration tab. | ACTIVE |
| `tools/sol-advisor/` | Sol Advisor validation/orchestration tool. | ACTIVE |
| `packages/` | Shared code baseline; empty until cross-tab reuse is proven. | ACTIVE |
| `data/` | Canonical shared data hub and migration manifests. | ACTIVE |

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
| `apps/graph-viewer/` | Separate graph viewer tab with nested Git boundary. | ACTIVE |
| `tools/sol-advisor/` | Validation/orchestration tool with nested Git boundary. | ACTIVE |
| `BAK/` | Backup/old material. | ARCHIVE_CANDIDATE |
| `dist/`, `node_modules/`, `.codegraph/`, `.git/` | Build, dependency, index, VCS internals. | Out of audit docs |
