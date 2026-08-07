# 🛡️ Sol-Advisor Plan: Modularizing MapLibreFastRenderer into Renderer Sub-Components (`docs/PLAN-decouple-basemap-database-async.md`)

## 1. Goal & Scope
- **Mục tiêu**: Phân tách file monolithic `MapLibreFastRenderer.tsx` (~95KB, 2075 lines) thành **3 Sub-Components độc lập** nằm trong thư mục mới `src/modules/design/features/map/renderer/` kết nối qua `MapContext`:
  1. `BasemapCanvasView.tsx`: Quản lý nền bản đồ, tile sources, camera snapshot & tile prefetching.
  2. `DatabaseLayerContainer.tsx`: Quản lý dữ liệu đối tượng từ SQLite Database (points, polylines, polygons, clusters, labels, chunked stream updates).
  3. `OverlayInteractionLayer.tsx`: Quản lý công cụ vẽ (drawing), điểm điều khiển (edit vertices), snap indicators, canvas FOV & DORI overlays.
  4. `MapLibreFastRenderer.tsx`: Rút gọn thành Thin Facade Controller (<15KB).
- **Cam kết**: 0 Regression, 100% Typecheck & Test PASS.

## 2. Component Boundaries & Decisions

### Sub-Folder `src/modules/design/features/map/renderer/`
- **`BasemapCanvasView.tsx`**:
  - Độc lập nạp `PersistentBasemapHost` và khởi tạo MapLibre GL canvas.
  - Cung cấp Map instance qua `MapContext`.
- **`DatabaseLayerContainer.tsx`**:
  - Nhận `map` từ `useMapContext()`.
  - Khởi tạo GeoJSON sources (`SOURCE_ID`, `POINT_CLUSTER_SOURCE_ID`) và mount các vector layers khi `map` ready và có project DB.
  - Tích hợp `useGisStreamCollector` để nhận dữ liệu chunked từ `GisStreamWorker`.
- **`OverlayInteractionLayer.tsx`**:
  - Nhận `map` từ `useMapContext()`.
  - Mount các drawing/edit layers (`DRAWING_SOURCE_ID`, `EDIT_SOURCE_ID`) và canvas overlays (`FeatureOverlayCanvas`, `DORIOverlay`, `FOVLayer`).
- **Hooks Submodule**:
  - `renderer/useMapLifecycle.ts`: Quản lý lifecycle & resize observer.
  - `renderer/useMapLayerRender.ts`: Quản lý progressive batching & LOD rendering.
  - `renderer/useMapInteractions.ts`: Quản lý hover, select, click, drag & mouse events.

---

## 3. Implementation Steps (Terra Lane)

### Phase 1: Tạo Sub-folder Renderer & Tách Custom Hooks
1. Tạo thư mục `src/modules/design/features/map/renderer/`.
2. Chuyển logic lifecycle, layer render và mouse interactions sang `useMapLifecycle.ts`, `useMapLayerRender.ts`, và `useMapInteractions.ts`.
3. Kiểm tra biên dịch Typecheck: `npm run typecheck`.

### Phase 2: Triển khai 3 Sub-Components Độc Lập
1. Tạo `BasemapCanvasView.tsx` xử lý Basemap Host & MapContext publishing.
2. Tạo `DatabaseLayerContainer.tsx` xử lý GeoJSON sources, vector layers & stream updates từ database.
3. Tạo `OverlayInteractionLayer.tsx` xử lý drawing, edit handles, FOV & DORI overlays.
4. Kiểm tra biên dịch Typecheck: `npm run typecheck`.

### Phase 3: Rút Gọn `MapLibreFastRenderer.tsx` Thành Thin Controller
1. Refactor `MapLibreFastRenderer.tsx` thành Facade Controller gọn nhẹ (<15KB) ghép nối 3 Sub-Components trên.
2. Đảm bảo 100% props và callbacks legacy hoạt động không có regression.
3. Chạy toàn bộ test suites: `npm run typecheck` & `npm run test:ci` & `cd src-tauri; cargo check`.

---

## 4. Verification Plan

### Automated Tests
- **Frontend Typecheck**: `npm run typecheck` (Yêu cầu 0 lỗi TS).
- **Frontend Unit Tests**: `npm run test:ci` (Yêu cầu 100% PASS).
- **Backend Cargo Check**: `cd src-tauri; cargo check` (Yêu cầu 0 lỗi).

---

## 5. Acceptance Criteria [SHIP]
- [ ] `MapLibreFastRenderer.tsx` giảm kích thước từ 95KB xuống <15KB.
- [ ] Thư mục `src/modules/design/features/map/renderer/` chứa 3 Sub-Components và 3 Hooks độc lập.
- [ ] Basemap khởi động độc lập hoàn toàn với dữ liệu DB.
- [ ] 100% TS typecheck, cargo check và unit tests PASS.
