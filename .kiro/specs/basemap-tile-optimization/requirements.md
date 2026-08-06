# Requirements Document

## Introduction

Basemap tile loading trong ứng dụng (React + TypeScript + MapLibre GL 5.x + Tauri 2.x) hiện gặp vấn đề blank/missing tiles xảy ra ở nhiều tình huống: khởi động app, chuyển preset, sau khi chạy lâu, và sau khi reconnect mạng. Pipeline tile loading cần được refactor toàn diện, bao gồm: caching strategy thống nhất qua Service Worker cho cả browser và desktop, concurrency control, retry/fallback mechanism, offline support, và sửa các race condition trong preset switching.

## Glossary

- **TileLoadingPipeline**: Toàn bộ chuỗi xử lý từ khi MapLibre yêu cầu một tile đến khi tile được render lên màn hình.
- **TileCache**: Bộ nhớ đệm tile, có thể là Service Worker cache (browser + desktop) hoặc Rust on-disk cache (desktop).
- **ServiceWorkerCache**: Cache layer chạy trong Service Worker, thống nhất cho cả browser mode và Tauri desktop mode.
- **BasemapRuntime**: Class quản lý MapLibre lifecycle, tile URL resolution, và preset management (`BasemapRuntime.ts`).
- **TileProtocolHandler**: Custom `basemap://` protocol handler trong `tileCache.ts` dùng để route tile requests qua Rust IPC.
- **PresetSwitcher**: Logic trong `BasemapRuntime.setPreset()` xử lý việc chuyển đổi giữa các basemap preset.
- **TilePrefetcher**: Module `tilePrefetch.ts` thực hiện warm-up cache ở launch time.
- **MapLibre**: Thư viện bản đồ MapLibre GL 5.x.
- **RustBackend**: Tauri 2.x Rust backend cung cấp IPC commands `get_basemap_tile` và `prefetch_basemap_tiles`.
- **TileRetryQueue**: Hàng đợi các tile request thất bại cần được retry.
- **FallbackPreset**: Preset dự phòng (`fallbackPresetId` trong config) được dùng khi preset hiện tại không tải được tile.
- **TileRequestTimeout**: Giá trị `tileRequestTimeoutMs` trong `BasemapRuntimeConfig`, kiểm soát thời gian chờ tối đa cho mỗi tile request.
- **SourceKey**: Chuỗi định danh duy nhất cho một tập upstream tile URLs, được tính bằng `deriveTileSourceKey()`.
- **StaleSource**: MapLibre raster source cũ còn tồn tại sau khi preset đã được chuyển đổi.
- **PrefetchReport**: Struct báo cáo kết quả prefetch gồm `requested`, `cached`, `fetched`, `failed`.

---

## Requirements

### Requirement 1 — Unified Service Worker Cache

**User Story:** As a developer maintaining the app, I want tile caching to work the same way in both browser and Tauri desktop environments, so that blank tiles caused by the browser having zero caching are eliminated.

#### Acceptance Criteria

1. THE **TileLoadingPipeline** SHALL register a Service Worker (`basemap-sw.js`) on application startup in both browser mode and Tauri desktop mode.
2. WHEN the Service Worker is registered successfully, THE **TileLoadingPipeline** SHALL route all Google Maps tile requests through the Service Worker cache before falling back to the network.
3. WHEN a tile is fetched from the network successfully, THE **ServiceWorkerCache** SHALL store the tile response in a dedicated cache partition named `basemap-tiles-v1`.
4. WHEN a tile request is made and a valid cached response exists in `basemap-tiles-v1`, THE **ServiceWorkerCache** SHALL return the cached response without making a network request.
5. IF Service Worker registration fails, THEN THE **TileLoadingPipeline** SHALL log a warning and continue tile loading without Service Worker caching, using direct network requests as fallback.
6. THE **ServiceWorkerCache** SHALL implement a cache eviction policy that limits the total cached tile count to a configurable maximum (default: 5000 tiles) using LRU eviction.
7. WHERE the Tauri desktop shell is active, THE **TileLoadingPipeline** SHALL use both the Service Worker cache (L1) and the Rust on-disk cache (L2) in a two-level hierarchy, checking L1 first.

---

### Requirement 2 — Tile Request Retry with Exponential Backoff

**User Story:** As a user, I want the map to automatically retry loading failed tiles, so that temporary network issues do not result in permanently blank tiles.

#### Acceptance Criteria

1. WHEN a tile request fails with a network error or HTTP status 5xx, THE **TileLoadingPipeline** SHALL enqueue the tile into the **TileRetryQueue**.
2. WHEN a tile is in the **TileRetryQueue**, THE **TileLoadingPipeline** SHALL retry the request up to 3 times using exponential backoff with initial delay 1000ms (delays: 1s, 2s, 4s).
3. WHEN a tile retry succeeds, THE **TileLoadingPipeline** SHALL deliver the tile data to MapLibre and remove the tile from the **TileRetryQueue**.
4. IF all 3 retries are exhausted and the tile still fails, THEN THE **TileLoadingPipeline** SHALL log the failure with tile coordinates `(z, x, y)` and the final HTTP status code.
5. WHEN a tile request fails with HTTP status 4xx (excluding 429), THE **TileLoadingPipeline** SHALL NOT retry the request, to avoid hammering a permanently unavailable resource.
6. WHEN a tile request fails with HTTP status 429 (rate limited), THE **TileLoadingPipeline** SHALL retry after a delay of 5000ms and include the `Retry-After` header value if present.

---

### Requirement 3 — Tile Request Timeout Enforcement

**User Story:** As a user, I want tile requests to time out instead of hanging indefinitely, so that slow network conditions do not cause tiles to remain blank forever.

#### Acceptance Criteria

1. THE **TileLoadingPipeline** SHALL apply `tileRequestTimeoutMs` from `BasemapRuntimeConfig` as the maximum duration for every individual tile fetch request.
2. WHEN a tile fetch exceeds `tileRequestTimeoutMs` milliseconds without completing, THE **TileLoadingPipeline** SHALL abort the request using `AbortController` and treat it as a network error for retry purposes.
3. THE **BasemapRuntime** SHALL pass `tileRequestTimeoutMs` to the `TileProtocolHandler` during initialization, so that the timeout is applied consistently to all tile requests including those routed through the `basemap://` protocol.
4. IF `tileRequestTimeoutMs` is not set or is zero, THEN THE **TileLoadingPipeline** SHALL use a default timeout of 10000ms.

---

### Requirement 4 — Race-Condition-Free Preset Switching

**User Story:** As a user, I want switching basemap presets to reliably display the new tiles, so that the map does not show blank tiles or tiles from the previous preset after a switch.

#### Acceptance Criteria

1. WHEN `setPreset()` is called on the **PresetSwitcher**, THE **PresetSwitcher** SHALL cancel any in-flight tile requests associated with the previous preset before applying the new preset.
2. WHEN `setPreset()` is called, THE **PresetSwitcher** SHALL call `source.setTiles()` with the new tile URLs and SHALL NOT call `source.reload()` subsequently, to prevent the race condition where `reload()` triggers a second tile fetch cycle with stale URLs.
3. WHEN `setPreset()` is called while the **MapLibre** map is not yet in `interactive` state, THE **PresetSwitcher** SHALL queue the preset change and apply it after the `render` event fires.
4. THE **TileProtocolHandler** SHALL clear the registration for the previous **SourceKey** from the in-memory sources registry when `setPreset()` is called, so that stale sources cannot serve tiles from the wrong cache partition.
5. WHEN `setPreset()` is called and the map source is successfully updated, THE **BasemapRuntime** SHALL transition the lifecycle state from `degraded` back to `interactive` if it was previously `degraded`.

---

### Requirement 5 — Extended Prefetch Coverage

**User Story:** As a user, I want the map to display tiles immediately when I zoom into any area of Vietnam, so that blank tiles do not appear when zooming beyond zoom level 8.

#### Acceptance Criteria

1. THE **TilePrefetcher** SHALL accept a `maxZoom` parameter and prefetch tiles up to the configured zoom level rather than being hardcoded to zoom level 8.
2. WHEN `warmCacheOnLaunch` is `true` in `BasemapRuntimeConfig`, THE **TilePrefetcher** SHALL prefetch tiles from zoom level 0 to zoom level 12 (inclusive) over the Vietnam bounds.
3. THE **TilePrefetcher** SHALL distribute prefetch requests across the 4 Google Maps tile subdomains (mt0–mt3) using the same `shardTemplate()` algorithm as the live tile transport.
4. WHEN the total number of enumerated tiles for the configured zoom range exceeds `MAX_PREFETCH_TILES` (1200), THE **TilePrefetcher** SHALL prioritize lower zoom levels and truncate higher zoom levels to stay within the limit.
5. WHEN the user calls `setPreset()`, THE **BasemapRuntime** SHALL cancel any in-progress prefetch for the previous preset using the `cancelPrefetch` function and schedule a new prefetch for the new preset.

---

### Requirement 6 — Offline Tile Serving

**User Story:** As a user working in areas with intermittent connectivity, I want the map to continue displaying previously-loaded tiles when offline, so that I can navigate without a network connection.

#### Acceptance Criteria

1. WHILE the application is offline (no network connectivity), THE **ServiceWorkerCache** SHALL serve cached tiles for all requests whose tile coordinates and source key are present in the `basemap-tiles-v1` cache partition.
2. IF a tile is requested while offline and is not present in any cache layer, THEN THE **TileLoadingPipeline** SHALL return a transparent 256×256 PNG placeholder tile instead of throwing an error.
3. WHEN network connectivity is restored, THE **TileLoadingPipeline** SHALL re-attempt loading tiles that were served as placeholders in the current viewport.
4. THE **TileLoadingPipeline** SHALL emit a `tile-offline-placeholder` event to the console (as `console.debug`) each time a placeholder tile is served, including the tile coordinates `(z, x, y)`.

---

### Requirement 7 — Error Observability and Lifecycle Recovery

**User Story:** As a developer debugging tile loading issues, I want structured error logging and automatic lifecycle recovery, so that blank tile incidents can be diagnosed and the map recovers without requiring a full page reload.

#### Acceptance Criteria

1. WHEN a tile load error occurs, THE **TileLoadingPipeline** SHALL log a structured entry including: tile coordinates `(z, x, y)`, upstream URL, HTTP status code, error message, and timestamp.
2. WHEN the **BasemapRuntime** `error` event fires from **MapLibre** and the source is `BASEMAP_SOURCE_ID`, THE **BasemapRuntime** SHALL set lifecycle state to `degraded` AND schedule a recovery attempt after 3000ms.
3. WHEN a recovery attempt is scheduled, THE **BasemapRuntime** SHALL call `source.reload()` on the `BASEMAP_SOURCE_ID` source to trigger a fresh tile load cycle.
4. IF 3 consecutive recovery attempts all fail (lifecycle stays `degraded` after each reload), THEN THE **BasemapRuntime** SHALL transition lifecycle state to `failed` and log a structured error with the last known error details.
5. WHEN the **BasemapRuntime** lifecycle transitions from `degraded` to `interactive`, THE **BasemapRuntime** SHALL log a structured recovery entry with the duration in milliseconds from the initial `degraded` transition.
6. THE **BasemapRuntime** SHALL emit lifecycle state changes to all registered `subscribeLifecycle` listeners within 0ms of the state transition (synchronously).
