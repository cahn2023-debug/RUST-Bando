# 🛡️ Sol-Advisor Plan: Refactor Independent Parallel Startup for Basemap & Database Objects (`docs/PLAN-decouple-basemap-database-async.md`)

## 1. Goal & Scope
- **Mục tiêu**: Refactor toàn bộ hệ thống để **Bản đồ nền (Basemap)** và **Đối tượng Database (GIS Features)** khởi động & vận hành song song độc lập dưới dạng 2 Async Tasks (Backend Rust Tokio Tasks + Frontend Chunked Stream Collectors).
- **Phạm vi tác động**:
  - `src-tauri/src/lib.rs` & `src-tauri/src/domain/implement/modules/v2/`: Khởi tạo 2 Tokio Workers độc lập ngay tại boot (`BasemapWorker` & `GisStreamWorker`).
  - `src-tauri/src/domain/implement/commands/modules/`: Thêm event emitters streaming (`gis:features-chunk`, `basemap:status-stream`).
  - `src/core/basemap/`: Tách biệt hoàn toàn `BasemapRuntime` và `PersistentBasemapHost` khỏi vòng đời nạp dữ liệu dự án.
  - `src/modules/design/features/map/`: Phân tách `MapLibreFastRenderer.tsx` thành thin controller sử dụng `useMapLayerRender.ts` & `mapFeatureService.ts` nạp dữ liệu chunked stream theo Spatial Bounding Box & LOD.
  - `src/core/stores/`: Phân tách Zustand Slices (`mapSlice`, `projectSlice`, `layoutSlice`).
- **Cam kết**: 0 Regression, tương thích ngược 100% với IPC legacy commands (`queryVisibleFeaturesV2`), 100% Typecheck & Cargo Check PASS.

## 2. Component Boundaries & Decisions

### Backend Layer (Rust / Tokio Tasks)
- **Basemap Task (`src-tauri/src/domain/implement/modules/v2/basemap/mod.rs`)**:
  - Độc lập quản lý raster/vector tile sources, local MBTiles/disk cache, prefetch tile policy.
  - Phát event status/health cho basemap qua Tauri Event `basemap:status-stream`.
- **GIS Database Stream Task (`src-tauri/src/domain/implement/modules/v2/gis/stream_worker.rs`)**:
  - Độc lập kết nối `PmpDatabase` SQLite engine.
  - Khi mở dự án hoặc thay đổi Viewport, thực thi spatial query không chặn UI thread, đóng gói chunk theo Spatial BBox & LOD level, rồi phát về Frontend qua Tauri Event `gis:features-chunk`.

### Frontend Layer (React / Zustand / MapLibre)
- **Basemap Host (`src/core/basemap/PersistentBasemapHost.tsx`)**:
  - Độc lập boot MapLibre GL canvas ngay lập tức với neutral background + tile layers.
- **GIS Stream Collector (`src/modules/design/features/map/services/mapFeatureService.ts`)**:
  - Lắng nghe event `gis:features-chunk` và gom dữ liệu (chunking).
  - Cập nhật từng phần (incremental `setData`) vào GeoJSON Sources của MapLibre mà không gây rác bộ nhớ hoặc khựng FPS.
- **Store Facade (`src/core/stores/slices/`)**:
  - `mapSlice.ts`: Quản lý trạng thái camera, zoom, basemap active style.
  - `projectSlice.ts`: Quản lý dự án, SQLite DB connection state, chunk loading telemetry.

---

## 3. Implementation Steps (Terra Lane)

### Phase 1: Rust Backend Tokio Worker & Event Streams
1. Tạo module `src-tauri/src/domain/implement/modules/v2/basemap/mod.rs` & `src-tauri/src/domain/implement/modules/v2/gis/stream_worker.rs`.
2. Spawn 2 async tasks độc lập trong `lib.rs` tại thời điểm app start.
3. Thêm Tauri Event Stream channels (`gis:features-chunk`, `basemap:status-stream`).
4. Kiểm tra biên dịch Rust: `cd src-tauri; cargo check`.

### Phase 2: Frontend Async Basemap & Stream Collector Hooks
1. Refactor `src/core/basemap/BasemapRuntime.ts` để boot độc lập 100% không phụ thuộc project state.
2. Viết hook `useGisStreamCollector.ts` lắng nghe `gis:features-chunk` và thực hiện spatial chunking + LOD update.
3. Tách Zustand Store thành 4 Slices trong `src/core/stores/slices/` (`mapSlice`, `layoutSlice`, `modalSlice`, `projectSlice`).
4. Kiểm tra Typecheck: `npm run typecheck`.

### Phase 3: Map Renderer Decoupling & Incremental GeoJSON Updates
1. Refactor `MapLibreFastRenderer.tsx` sử dụng `useGisStreamCollector` và `mapFeatureService`.
2. Đảm bảo Basemap hiển thị ngay lập tức trong 100ms, dữ liệu DB đổ về mượt mà từng chunk.
3. Chạy toàn bộ test suites: `npm run test:ci` và `cargo test`.

---

## 4. Verification Plan

### Automated Tests
- **Frontend Typecheck**: `npm run typecheck` (Yêu cầu 0 lỗi TS).
- **Frontend Unit Tests**: `npm run test:ci` (Yêu cầu 100% PASS).
- **Backend Cargo Check & Test**: `cd src-tauri; cargo check` và `cargo test` (Yêu cầu 0 lỗi).

### Manual / Integration Verification
- Mở ứng dụng ➔ Xác nhận Basemap hiển thị tức thì (UI responsive).
- Mở dự án mẫu có 10,000+ features ➔ Xác nhận features được stream theo chunks, không giật lag.
- Đổi basemap style ➔ Basemap đổi style lập tức mà không ảnh hưởng tới dữ liệu database layers đang render.

---

## 5. Acceptance Criteria [SHIP]
- [ ] Basemap khởi động độc lập hoàn toàn không chờ nạp SQLite DB.
- [ ] Database Features được stream qua 2 Tokio Async Tasks bên Rust backend và nạp incremental chunked ở Frontend.
- [ ] 100% TS typecheck & Rust cargo check PASS.
- [ ] Tất cả unit tests đều PASS 100%.
- [ ] Monolithic `MapLibreFastRenderer.tsx` được phân tách sạch sẽ, modular, đúng Layered Architecture.
