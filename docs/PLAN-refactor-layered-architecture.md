# 🛡️ Sol-Advisor Plan: Refactor Toàn Bộ Dự Án theo Feature-Driven Layered Architecture (`docs/PLAN-refactor-layered-architecture.md`)

## 1. Goal & Scope
- **Mục tiêu**: Refactor toàn diện mã nguồn Frontend (`src/`) và Backend Rust (`src-tauri/`) sang **Feature-Driven & Layered Architecture** (UI Components -> Custom Hooks -> Domain Services -> Zustand Store Slices / Rust Submodules).
- **Phạm vi tác động**:
  - `src/core/stores/useLayoutStore.ts` (~23.4 KB) ➔ Zustand Slice Pattern tại `src/core/stores/slices/`.
  - `src/modules/design/features/map/MapLibreFastRenderer.tsx` (~95.5 KB) ➔ Phân tách thành `services/`, `hooks/`, `components/`.
  - `src-tauri/src/domain/implement/commands/mod.rs` ➔ Phân nhóm 70+ Tauri commands thành các Rust submodules tại `src-tauri/src/domain/implement/commands/modules/`.
- **Cam kết**: 0 Regression, bảo toàn 100% logic và giao diện hiện tại.

## 2. Component Boundaries & Decisions
- **State Store Layer (Phase 1)**:
  - `src/core/stores/slices/layoutSlice.ts` (NEW)
  - `src/core/stores/slices/mapSlice.ts` (NEW)
  - `src/core/stores/slices/modalSlice.ts` (NEW)
  - `src/core/stores/slices/projectSlice.ts` (NEW)
  - `src/core/stores/useLayoutStore.ts` (MODIFY - Root Store / Facade)
- **Map Module Layer (Phase 2)**:
  - `src/modules/design/features/map/services/mapTileService.ts` (NEW)
  - `src/modules/design/features/map/services/mapFeatureService.ts` (NEW)
  - `src/modules/design/features/map/hooks/useMapLifecycle.ts` (NEW)
  - `src/modules/design/features/map/hooks/useMapLayerRender.ts` (NEW)
  - `src/modules/design/features/map/hooks/useMapInteractions.ts` (NEW)
  - `src/modules/design/features/map/components/MapOverlayContainer.tsx` (NEW)
  - `src/modules/design/features/map/components/MapCanvasView.tsx` (NEW)
  - `src/modules/design/features/map/MapLibreFastRenderer.tsx` (MODIFY - Thin Controller <15KB)
- **Rust Backend Command Layer (Phase 3)**:
  - `src-tauri/src/domain/implement/commands/modules/storage_commands.rs` (NEW)
  - `src-tauri/src/domain/implement/commands/modules/ai_commands.rs` (NEW)
  - `src-tauri/src/domain/implement/commands/modules/gis_commands.rs` (NEW)
  - `src-tauri/src/domain/implement/commands/modules/sync_commands.rs` (NEW)
  - `src-tauri/src/domain/implement/commands/modules/media_commands.rs` (NEW)
  - `src-tauri/src/domain/implement/commands/modules/basemap_commands.rs` (NEW)
  - `src-tauri/src/domain/implement/commands/mod.rs` (MODIFY - Import submodules)

## 3. Implementation Steps (Terra Lane)
- **Phase 1 (State Layer)**: Tạo 4 Zustand Slices và update `useLayoutStore.ts` làm Facade. Chạy verify `npm run typecheck` + `npm run test`.
- **Phase 2 (Map Component Layer)**: Tách các services & hooks của MapLibreFastRenderer, refactor `MapLibreFastRenderer.tsx` thành thin controller. Chạy verify `npm run typecheck` + `npm run test`.
- **Phase 3 (Rust Command Layer)**: Tách 70+ Tauri commands trong `mod.rs` thành 6 command modules trong Rust. Chạy verify `cd src-tauri; cargo check`.

## 4. Verification Plan
- `npm run typecheck` (PASS - 0 type errors)
- `npm run test:ci` (PASS - 100% tests passing)
- `cd src-tauri; cargo check` (PASS - 0 compilation errors)

## 5. Acceptance Criteria [SHIP]
- [ ] 100% typecheck TS & cargo check Rust biên dịch thành công.
- [ ] Tất cả unit tests đều PASS.
- [ ] File monolithic lớn nhất (`MapLibreFastRenderer.tsx`) giảm từ 95KB xuống <15KB.
- [ ] 70+ Tauri commands được phân nhóm gọn gàng theo domain submodule.

