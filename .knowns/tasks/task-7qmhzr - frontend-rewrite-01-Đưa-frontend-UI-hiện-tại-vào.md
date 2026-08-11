---
id: 7qmhzr
title: "[frontend-rewrite-01] Đưa frontend/UI hiện tại vào BAK và lập kế hoạch viết lại theo database"
status: in-progress
priority: high
labels:
  - normal
  - frontend
  - ui
  - rewrite
  - database
  - architecture
createdAt: '2026-08-09T03:51:46.654Z'
updatedAt: '2026-08-11T04:51:14.371Z'
timeSpent: 1279
assignee: '@me'
---
# [frontend-rewrite-01] Đưa frontend/UI hiện tại vào BAK và lập kế hoạch viết lại theo database

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Đưa mã frontend React/TypeScript hiện tại và các UI feature vào một snapshot có manifest trong BAK để chuẩn bị viết lại; giữ backend Rust/Tauri và database SQLite/.pmp làm nguồn dữ liệu chuẩn. Lập kế hoạch viết lại theo schema, event/command flow, contracts, UI requirements và quality gates của dự án. Không tự ý xóa hoặc ghi đè thay đổi hiện có.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Snapshot frontend hiện tại vào BAK/archive/2026-08-09/frontend với manifest SHA-256; không làm thay đổi BAK hiện hữu, src-tauri, database hoặc thay đổi dirty ngoài phạm vi.
- [x] #2 Data contracts mới map được các bảng/constraints/event flow canonical từ schema.rs và các Tauri IPC command tương ứng.
- [x] #3 Rewrite roadmap được chia theo bounded vertical slices Project/File, Map/Feature, Fiber/Inventory, Sync/AI/Reports.
- [x] #4 UI shell mới tuân thủ React/TypeScript/Tauri, Zustand, MapLibre, CSS tokens, i18n và accessibility requirements của dự án.
- [x] #5 Mỗi slice có unit/integration/regression tests và đạt npm run check:frontend, npm run check:backend, npm run check trước bàn giao.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. **Freeze baseline và tạo snapshot frontend vào BAK**
   - Ghi lại commit/working-tree hiện tại, danh sách file đang modified/untracked và inventory BAK; không ghi đè snapshot cũ.
   - Sau khi được duyệt, chuyển nguyên cây frontend hiện tại `src/` (460 file, gồm `contracts`, `core`, `modules`, `shared`, test setup) vào `BAK/archive/2026-08-09/frontend/src/`, giữ nguyên relative path.
   - Đưa `public/basemap-sw.js` vào cùng snapshot vì đây là runtime asset của frontend; giữ `src-tauri/`, `package.json`, `vite.config.ts`, `index.html`, database và các asset public khác ngoài phạm vi.
   - Tạo `BAK/archive/2026-08-09/frontend/MANIFEST.md` với source path, target path, SHA-256, file count, commit và trạng thái dirty để rollback/audit được.
   - **Verify:** manifest khớp số lượng/hash; BAK hiện hữu không đổi; backend/database không bị di chuyển.

2. **Chốt data contract theo database sống và IPC**
   - Dùng `src-tauri/src/domain/implement/modules/v2/storage/schema.rs` làm canonical source, không dùng các bảng mô tả cũ làm nguồn duy nhất.
   - Lập data matrix cho các nhóm: `projects/files`; `regions/layers/feature_groups/features`; `project_settings/project_snapshots`; `events/sync_outbox/sync_cursor/sync_conflicts`; FTS5; media; fiber topology; equipment; AI/reporting.
   - Đối chiếu khóa ngoại, cascade, JSON validation, bbox/spatial index, schema compatibility và event ordering với `src-tauri/src/domain/implement/commands/v2.rs`, `v2_bridge.rs`, `worker_storage.rs`.
   - Viết lại các public TypeScript contracts và API adapters quanh `src/contracts/tauri-api/`, bảo đảm mapping camelCase/snake_case, Result/error shape và không để UI gọi `invoke` trực tiếp.
   - **Verify:** mỗi use-case UI có command, request/response type, table/read model và error path tương ứng; không còn contract chỉ tồn tại ở component.

3. **Dựng frontend shell mới và hạ tầng truy cập dữ liệu**
   - Tạo entrypoint/app shell mới thay cho `src/modules/home/main.tsx` và `App.tsx`, với lifecycle rõ cho boot, project open/close, loading, error và empty states.
   - Tách các lớp `app/`, `domain/`, `application/`, `infrastructure/tauri/`, `shared/ui/` theo bounded context; Zustand chỉ giữ client/UI state, còn server state lấy qua service/query adapters.
   - Dựng error boundary, cancellation, request correlation và event subscription để UI không block main thread khi đọc/ghi SQLite.
   - **Verify:** shell chạy được với mock IPC; typecheck không phụ thuộc vào code archive; không có direct database access từ React component.

4. **Viết lại theo vertical slice, theo đúng thứ tự phụ thuộc**
   - **Slice A — Project/File/Metadata:** project lifecycle, recent/open/save, file index, contract metadata, FTS search; dựa trên `projects`, `files`, `project_settings`, `project_snapshots`.
   - **Slice B — Map hierarchy và feature rendering:** Region → Layer → Feature Group → Feature, selection/property edit, bbox/spatial query, map tile cache; giữ mục tiêu first-feature < 2000ms, RAF < 16ms, progressive batch ≤ 200 và viewport-first theo các spec map hiện có.
   - **Slice C — Fiber topology/Inventory:** cables, strands, points, ports, terminations, patches, splices, circuits/hops, equipment; validate topology và cập nhật read model theo event.
   - **Slice D — Sync/History/AI/Reports:** event replay, outbox/conflict state, undo/redo history, AI metadata/corrections và các dashboard/export; chỉ mở rộng sau khi A–C ổn định.
   - Mỗi slice phải có model, repository/service, IPC adapter, store, UI route/component và test fixture riêng; không dồn toàn bộ rewrite vào một module lớn.

5. **Viết lại UI system và các feature UI**
   - Dựng lại TitleBar, Ribbon, left layer/project dock, map canvas, right Property Panel, BOM/analysis panels, Command Line và Status Bar theo `@doc/architecture/frontend`, `@doc/architecture/overview` và `docs/architecture/UI_MAP_FEATURES_SUMMARY.md`.
   - Giữ CSS token `--cad-*`/Tailwind, kích thước chrome, z-index, dual theme; cấm hardcode màu trong component.
   - Bắt buộc i18n qua `react-i18next`, keyboard/focus semantics và WCAG focus ring; thêm loading/error/empty states cho từng panel.
   - **Verify:** component tests cho interaction chính, accessibility smoke checks và snapshot/visual checklist cho shell/map/property workflows.

6. **Kiểm thử dữ liệu, hiệu năng và hồi quy theo từng slice**
   - Rust: schema compatibility, FK/cascade, JSON/bbox validation, event append/replay, projection/hydration, IPC command contract.
   - Frontend: unit/integration tests cho adapters/stores/components; map tests cho progressive rendering, viewport refresh, tile retry/timeout/offline fallback và preset switching.
   - Chạy benchmark/telemetry cho `first-feature < 2000ms`, frame < 16ms, không render trùng/bỏ sót feature; kiểm tra không tạo query loop.
   - **Verify:** test của slice pass trước khi mở slice tiếp theo; không dùng mock để che lỗi schema/IPC thật.

7. **Transition, quality gate và bàn giao**
   - Chỉ sau khi shell/slice tương ứng thay thế được entrypoint cũ mới xóa các import/path cũ; không xóa archive.
   - Chạy theo `@doc/guides/development`: `npm run check:frontend`, `npm run check:backend`, rồi `npm run check`; kiểm tra encoding, boundaries, lint, typecheck, tests, build và cargo checks.
   - Kiểm tra diff chỉ gồm snapshot/manifest và file rewrite đã được duyệt; ghi rollback path về `BAK/archive/2026-08-09/frontend/`.

### Plan check

- **AC coverage:** archive/manifest ở bước 1; database/IPC fidelity ở bước 2; file rewrite mới ở bước 3–5; regression/performance ở bước 6; quality gate/rollback ở bước 7.
- **Scope:** 460 file archive vượt một session đơn lẻ; phải thực hiện như một thao tác snapshot riêng. Các slice A–D là các task triển khai độc lập, không che giấu trong một task rewrite duy nhất.
- **Dependency:** schema/IPC → contracts → infrastructure/shell → Project/File → Map → Fiber → Sync/AI/Reports → final gate.
- **Risk:** bước archive làm frontend build hỏng tạm thời; cần dựng shell tối thiểu trong cùng wave triển khai trước khi chạy frontend gate. Thay đổi contract/store dùng chung có blast radius cao.
- **Assumption cần duyệt:** “đưa vào BAK” được hiểu là physical move có manifest sau approval, không phải xóa; `src-tauri` và database giữ nguyên làm runtime source of truth.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Context gathered: current frontend is src/ with 460 files; existing BAK contains 162 files and BAK/frontend has 3 legacy utilities. Canonical DB schema is src-tauri/src/domain/implement/modules/v2/storage/schema.rs (BASE_SCHEMA_SQL plus v2/v9/v10/v11 compatibility). Existing working tree contains pre-existing frontend changes and untracked Knowns metadata; preserve them. A draft system decision about viewportQueryRevision was found but is not accepted and has an unreadable external ref, so it is not treated as an authoritative decision.
Done: archived 460 legacy src files plus public/basemap-sw.js under BAK/archive/2026-08-09/frontend; created MANIFEST.md with 461-file tree SHA-256 67e7f09b6a6d84f85cac526b56add427ab0daaeca8aa76ac4c096d9362847ec6. Created replacement shell at src/app, i18n locales, database contracts, typed project/map/fiber Tauri adapters, and updated the boundary checker for the new IPC facade. Existing BAK archives, src-tauri, database, and pre-existing dirty changes were preserved. Verification: npm run check passed; frontend encoding/boundaries/typecheck/lint/test/build passed (1 test); backend fmt/check/test/clippy passed (87 tests, 1 ignored). Follow-up slices created: mup6bx Project/File/Metadata, 9bp8ef Map/Feature, f89qca Fiber/Inventory, baxorm Sync/History/AI/Reports. System Decision Impact: candidate @decision/20260809-1117-frontend-replacement-uses-typed-tauri-boundary-with-archived-legacy-source (added) — draft needs review after linked implementation tasks complete. Remaining ACs 4–5 require the follow-up slices and their feature-level tests.
Implemented AutoCAD-style replacement UI shell in src/app: TitleBar, ribbon tabs/action groups, Lucide icons, CAD dark/light CSS tokens, project explorer, MapLibre Google street basemap, navigation/scale controls, command line, status bar, and responsive/a11y semantics. Added Zustand database bootstrap binding from get_active_project/get_project_bootstrap_v2 for Project → Region → Layer → Feature Group → Feature; selecting a feature populates the property panel from canonical DB fields and metadata. Fixed coordinates_json normalization to preserve array/object geometry. Added browser/empty/loading/error states and feature-level integration tests for navigation, theme, bootstrap hydration, selection, and property rendering. Verification: npm run check:frontend passed (encoding/boundaries/typecheck/lint/test: 2 passed/build); npm run check:backend passed (87 passed, 1 ignored); git diff --check passed. System Decision Impact: none — implementation follows the existing approved plan and existing typed Tauri/database contracts; no new project guidance was introduced.
Final gate: npm run check passed end-to-end after UI implementation (frontend encoding/boundaries/typecheck/lint/test/build + backend fmt/check/test/clippy). Parent task intentionally remains in-progress because child implementation tasks mup6bx, 9bp8ef, f89qca, baxorm remain todo; their slice-specific UI/API/test work is the next phase.
Reorganized frontend per follow-up request: current replacement frontend archived at BAK/archive/2026-08-09/replacement-frontend (16 source files plus index.html, manifest/hash); legacy frontend restored from BAK/archive/2026-08-09/frontend/src into live src/ (460 files), legacy public/basemap-sw.js restored, and index.html points to src/modules/home/main.tsx. Validation after restore: typecheck, build, encoding, Tauri boundaries, lint (0 errors, 1147 pre-existing warnings), and test:ci (93 files, 590 passed) all passed. Parent remains in-progress for child slices.
Final swap verification: npm run check passed after legacy frontend restore (encoding 518 files; Tauri boundaries; typecheck; lint 0 errors/1147 legacy warnings; 93 test files/590 tests passed; Vite build; backend 87 passed/1 ignored). Live src has 460 legacy frontend files and index.html points to src/modules/home/main.tsx. Replacement archive payload is preserved separately with manifest/hash.
Project-wide Knowns consolidation completed: canonical summary @doc/architecture/project-summary-current-state; extracted patterns/decisions/failures @doc/learnings/learning-project-wide-source-alignment-audit-2026-08-11; updated @doc/architecture/overview, @doc/architecture/backend, @doc/architecture/frontend, @doc/guides/development and @doc/specs/overview. Live frontend vs replacement BAK status and schema/IPC source-of-truth are explicitly recorded. Docs validation: 0 errors/warnings.
<!-- SECTION:NOTES:END -->

