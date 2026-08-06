# Implementation Plan: Basemap Tile Optimization

## Overview

Refactor the basemap tile loading pipeline (React + TypeScript + MapLibre GL 5.x + Tauri 2.x) để loại bỏ blank/missing tiles. Gồm 6 nhóm công việc: tạo Service Worker layer (L1 cache), bổ sung retry/timeout trong tileCache, sửa race condition trong preset switching, thêm recovery state machine vào BasemapRuntime, mở rộng prefetch coverage lên z12, và viết tests.

## Tasks

- [x] 1. Tạo `tilePlaceholder.ts` và `tileServiceWorker.ts`
  - [x] 1.1 Tạo `src/core/basemap/tilePlaceholder.ts` với transparent PNG constant và factory functions
    - Export `TRANSPARENT_PNG_B64` (base64, 1×1 transparent PNG)
    - Export `transparentPngBytes(): Uint8Array` — decode base64 → Uint8Array
    - Export `transparentPngResponse(): Response` — trả về Response có `Content-Type: image/png` và `X-Basemap-Placeholder: 1`
    - _Requirements: 6.2, 6.4_

  - [x] 1.2 Tạo `src/core/basemap/tileServiceWorker.ts` với SW registration
    - Export `registerTileServiceWorker(): Promise<void>`
    - Guard: `typeof navigator === 'undefined' || !('serviceWorker' in navigator)` → return sớm
    - Register `/basemap-sw.js` với `scope: '/'`, await `navigator.serviceWorker.ready`
    - On success: `console.debug('[BasemapSW] registered', reg.scope)`
    - On failure: `console.warn('[BasemapSW] registration failed — proceeding without SW cache', err)` — không throw
    - _Requirements: 1.1, 1.5_

- [x] 2. Tạo `public/basemap-sw.js` — Service Worker script
  - [x] 2.1 Tạo `public/basemap-sw.js` với cache-first strategy và LRU eviction
    - Định nghĩa `CACHE_NAME = 'basemap-tiles-v1'`, `LRU_META_KEY = 'basemap-lru-meta'`, `MAX_TILES = 5000`
    - `TILE_URL_PATTERN = /^https:\/\/mt[0-3]\.google\.com\/vt\//` — chỉ intercept Google Maps tiles
    - `addEventListener('fetch', ...)`: nếu URL không match pattern thì `return` (không intercept)
    - `handleTileRequest(request)`: check `cache.match(request)` → nếu hit, `touchLru(url)` rồi return cached response
    - On cache miss: `fetch(request)`, nếu `response.ok` thì `cache.put(request, response.clone())` và `insertLru(url, cache)`
    - On fetch error (offline): emit `console.debug('[BasemapSW] tile-offline-placeholder', request.url)`, return transparent PNG response (inline constant — không dùng import)
    - `insertLru(url, cache)`: đọc LRU meta, append url, nếu `length > MAX_TILES` evict front (xóa khỏi cache và meta)
    - `touchLru(url)`: đọc LRU meta, xóa url cũ, append lại cuối (MRU position)
    - LRU meta được store trong `caches.open(CACHE_NAME)` dưới key `LRU_META_KEY` dạng JSON
    - _Requirements: 1.2, 1.3, 1.4, 1.6, 6.1, 6.2, 6.4_

  - [ ]* 2.2 Viết property test cho SW cache round-trip (Property 2)
    - **Property 2: Cache Round-Trip** — tile URL trả về response ok → URL có thể retrieve từ `basemap-tiles-v1` cache, bytes giống response body gốc
    - **Validates: Requirements 1.3, 1.4**
    - Dùng fake `caches` API (mock) trong Vitest, test với random tile URLs
    - File: `src/core/basemap/__tests__/basemap-sw.test.ts`

  - [ ]* 2.3 Viết property test cho LRU eviction invariant (Property 3)
    - **Property 3: LRU Eviction Invariant** — sau khi insert N > MAX_TILES unique URLs, tổng entries trong cache không vượt quá MAX_TILES; entries present luôn là các URL được accessed gần nhất
    - **Validates: Requirements 1.6**
    - File: `src/core/basemap/__tests__/basemap-sw.test.ts`

  - [ ]* 2.4 Viết unit test cho offline placeholder (Property 12)
    - **Property 12: Offline Placeholder for Cache Miss** — tile absent khỏi cache + fetch fail → response là valid PNG + `console.debug` có coordinates
    - **Validates: Requirements 6.2, 6.4**
    - File: `src/core/basemap/__tests__/basemap-sw.test.ts`

- [x] 3. Checkpoint — Kiểm tra các file mới
  - Ensure `tilePlaceholder.ts` và `tileServiceWorker.ts` compile không có lỗi TypeScript
  - Ensure `public/basemap-sw.js` là valid JavaScript (plain JS, không dùng ES modules)
  - Ensure tất cả tests liên quan đến SW pass, ask the user if questions arise.

- [x] 4. Sửa `tileCache.ts` — thêm fetchWithTimeout, TileRetryQueue, clearSourceKey, TileProtocolHandlerOptions
  - [x] 4.1 Thêm `TileProtocolHandlerOptions` interface và `fetchWithTimeout` function
    - Export interface `TileProtocolHandlerOptions { timeoutMs: number }`
    - Thêm module-level `let handlerOptions: TileProtocolHandlerOptions = { timeoutMs: 10_000 }`
    - Cập nhật `registerBasemapTileProtocol(options?: TileProtocolHandlerOptions): void` — nhận options, set `handlerOptions`; vẫn idempotent (guard `protocolRegistered`)
    - Implement `async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response>`:
      - Tạo `AbortController`, set `setTimeout(() => controller.abort(), timeoutMs || 10_000)`
      - `fetch(url, { signal })` trong try/finally để `clearTimeout`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 4.2 Implement `TileRetryQueue` và retry logic trong `loadThroughCache`
    - Định nghĩa interface `RetryEntry { url, sourceKey, z, x, y, attempts, lastStatus? }`
    - Thêm constants: `RETRY_BASE_DELAY_MS = 1000`, `RETRY_MAX_ATTEMPTS = 3`, `RETRY_RATE_LIMIT_DELAY_MS = 5000`
    - Tạo `Map<string, RetryEntry> retryQueue` (key = `${sourceKey}/${z}/${x}/${y}`)
    - Implement `async function retryTileFetch(entry: RetryEntry): Promise<ArrayBuffer>` với exponential backoff:
      - Tính delay: `RETRY_BASE_DELAY_MS * 2^(attempts-1)` cho network/5xx; `RETRY_RATE_LIMIT_DELAY_MS` cho 429
      - Sau mỗi lần thành công: xóa khỏi `retryQueue`, return bytes
      - Sau khi hết 3 attempts: log structured `TileLoadError` (z, x, y, url, status, message, timestamp ISO 8601), serve placeholder
    - Cập nhật `loadThroughCache` để dùng `fetchWithTimeout` thay vì `fetch` trực tiếp, và enqueue vào `retryQueue` khi fail với 5xx/network error; skip retry với 4xx (trừ 429)
    - Export `clearRetryQueue(sourceKey: string): void` để dọn queue khi preset switch
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 4.3 Export `clearSourceKey(key: string): void`
    - `sources.delete(key)` — xóa stale source registry entry khi preset switch
    - Thêm vào export list của `tileCache.ts`
    - _Requirements: 4.4_

  - [ ]* 4.4 Viết property test cho retry queue membership và exhaustion (Property 5)
    - **Property 5: Retry Queue Membership and Exhaustion** — tile fail với 5xx/network error → present trong queue với `attempts < 3` sau mỗi lần fail; exactly 3 total retries; 4xx (not 429) → 0 additional attempts
    - **Validates: Requirements 2.1, 2.2, 2.5**
    - File: `src/core/basemap/__tests__/tileCache.test.ts`

  - [ ]* 4.5 Viết property test cho timeout aborts request (Property 8)
    - **Property 8: Timeout Aborts Request** — fetch không hoàn thành trong `tileRequestTimeoutMs` ms → `AbortController.abort()` được gọi, error được classify là network error
    - **Validates: Requirements 3.1, 3.2**
    - File: `src/core/basemap/__tests__/tileCache.test.ts`

  - [ ]* 4.6 Viết property test cho stale source key cleanup (Property 10)
    - **Property 10: Stale SourceKey Cleared on Preset Switch** — sau `clearSourceKey(K_A)`, `sources` Map không còn entry cho K_A
    - **Validates: Requirements 4.4**
    - File: `src/core/basemap/__tests__/tileCache.test.ts`

  - [ ]* 4.7 Viết property test cho shard distribution coverage (Property 16)
    - **Property 16: Shard Distribution Coverage** — với tập tile coordinates ≥ 4 phân bố đều qua `(x+y) mod 4`, mỗi subdomain mt0–mt3 được `shardTemplate` chọn ít nhất 1 lần
    - **Validates: Requirements 5.3**
    - File: `src/core/basemap/__tests__/tileCache.test.ts`

- [x] 5. Checkpoint — tileCache.ts hoạt động đúng
  - Chạy `tileCache.test.ts`, ensure tất cả tests pass, ask the user if questions arise.

- [ ] 6. Sửa `tilePrefetch.ts` — tăng PREFETCH_MAX_ZOOM từ 8 lên 12
  - [x] 6.1 Cập nhật `PREFETCH_MAX_ZOOM` constant từ `8` thành `12` trong `tilePrefetch.ts`
    - Thay đổi duy nhất: `const PREFETCH_MAX_ZOOM = 12`
    - Verify: `enumerateTiles` vẫn truncate đúng tại `MAX_PREFETCH_TILES = 1200`
    - `prefetchBasemapTiles` và `scheduleBasemapPrefetch` signatures không thay đổi
    - _Requirements: 5.1, 5.2, 5.4_

  - [ ]* 6.2 Viết property test cho zoom bound (Property 15)
    - **Property 15: Prefetch Zoom Bound** — với bất kỳ `maxZoom` M, mọi tile coordinate trong result đều có `z ≤ M`; nếu count > `MAX_PREFETCH_TILES` thì `array.length === MAX_PREFETCH_TILES` với tiles từ lower z-levels xuất hiện trước
    - **Validates: Requirements 5.1, 5.4**
    - File: `src/core/basemap/__tests__/tilePrefetch.test.ts`

  - [ ]* 6.3 Viết unit tests cho limit truncation và shard coverage
    - Test: `enumerateTiles` với `maxZoom = 12` → truncate tại 1200, z-order đúng
    - Test: shard coverage trên kết quả `enumerateTiles` cho Vietnam bounds
    - _Requirements: 5.3, 5.4_
    - File: `src/core/basemap/__tests__/tilePrefetch.test.ts`

- [x] 7. Sửa `BasemapRuntime.ts` — fix setPreset, thêm recovery state machine
  - [x] 7.1 Thêm các private fields cho recovery state machine và tileAbortController
    - Thêm `private tileAbortController: AbortController | null = null`
    - Thêm `private recoveryAttempts = 0`
    - Thêm `private degradedAt: number | null = null`
    - Thêm `private recoveryTimer: ReturnType<typeof setTimeout> | null = null`
    - Import `clearSourceKey`, `clearRetryQueue` từ `tileCache.ts`
    - Import `deriveTileSourceKey` từ `tileCache.ts` (đã có)
    - _Requirements: 4.1, 7.2_

  - [x] 7.2 Cập nhật `initialize()` để gọi `registerTileServiceWorker()` và truyền `TileProtocolHandlerOptions`
    - Import `registerTileServiceWorker` từ `tileServiceWorker.ts`
    - Import `registerBasemapTileProtocol` (đã có) và cập nhật call để truyền `{ timeoutMs: this.config.tileRequestTimeoutMs }`
    - Gọi `await registerTileServiceWorker()` trước khi tạo `maplibregl.Map` (non-blocking vì failure chỉ log warn)
    - _Requirements: 1.1, 3.3_

  - [x] 7.3 Rewrite `setPreset()` — no source.reload(), AbortController, queue pre-interactive, clear stale key
    - Cancel in-flight prefetch: `this.cancelPrefetch?.(); this.cancelPrefetch = null`
    - Cancel in-flight tile requests: `this.tileAbortController?.abort(); this.tileAbortController = new AbortController()`
    - Clear stale source key: tính `previousKey = deriveTileSourceKey(this.presetId, getStyledBasemapTiles(this.presetId, this.preferences))`, gọi `clearSourceKey(previousKey)` và `clearRetryQueue(previousKey)`
    - Update `this.presetId` và `this.preferences`
    - Nếu không có map: set config, store, emit → return
    - Định nghĩa `applyPreset()` closure:
      - `source?.setTiles?.(this.resolveTileUrls())` — **KHÔNG** gọi `source?.reload?.()`
      - Nếu `this.lifecycleState === 'degraded'`: `this.setLifecycleState('interactive')`
      - `storePreferences(this.getPreferences())`
      - `this.emitPreset()`
      - Schedule new prefetch: `this.cancelPrefetch = scheduleBasemapPrefetch(...)`
    - Nếu `lifecycleState === 'interactive'`: gọi `applyPreset()` trực tiếp
    - Ngược lại: `this.map.once('render', applyPreset)`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 7.4 Thêm `handleMapError`, `scheduleRecovery`, `attemptRecovery` và recovery logging vào `setLifecycleState`
    - Cập nhật `map.on('error', ...)` handler → gọi `this.handleMapError(event)` (thay vì inline logic cũ)
    - `handleMapError(event)`: guard nếu `sourceId !== BASEMAP_SOURCE_ID`; nếu chưa `degraded` thì set `degradedAt = Date.now()`, `recoveryAttempts = 0`; set state → `degraded`; gọi `scheduleRecovery()`
    - `scheduleRecovery()`: idempotent (guard `recoveryTimer !== null`); `setTimeout(attemptRecovery, 3000)`
    - `attemptRecovery()`: nếu `recoveryAttempts >= 3` → `setLifecycleState('failed')` + `console.error` structured entry; ngược lại `recoveryAttempts++`, gọi `source?.reload?.()`
    - Cập nhật `setLifecycleState()`: khi transition `degraded` → `interactive` + `degradedAt !== null` → `console.info('[Basemap] lifecycle-recovered', { durationMs })`, reset `degradedAt = null`, `recoveryAttempts = 0`
    - Đảm bảo listeners được gọi synchronously (không có setTimeout/microtask)
    - Trong `destroy()`: clear `recoveryTimer` và abort `tileAbortController`
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 7.5 Viết property test cho lifecycle listeners synchronous notification (Property 13)
    - **Property 13: Lifecycle Listeners Notified Synchronously** — với bất kỳ lifecycle state transition, tất cả listeners đã đăng ký qua `subscribeLifecycle` được invoke với new state trước khi `setLifecycleState` return
    - **Validates: Requirements 7.6**
    - File: `src/core/basemap/__tests__/BasemapRuntime.test.ts`

  - [ ]* 7.6 Viết property test cho recovery exhaustion → failed state (Property 14)
    - **Property 14: Recovery Exhaustion Leads to Failed State** — 3 consecutive map error events trên `BASEMAP_SOURCE_ID` + mỗi recovery attempt bị follow bởi error event → lifecycle state = `failed` sau attempt thứ 3, structured error log được emit
    - **Validates: Requirements 7.4**
    - File: `src/core/basemap/__tests__/BasemapRuntime.test.ts`

  - [ ]* 7.7 Viết unit tests cho preset switch sequence và lifecycle transitions
    - Test: `setPreset()` → `source.reload()` không được gọi (spy assertion)
    - Test: `setPreset()` khi lifecycle không phải `interactive` → applyPreset queued, applied sau `render` event
    - Test: `setPreset()` transitions `degraded` → `interactive`
    - Test: `setPreset()` cancels previous `cancelPrefetch`
    - Test: Property 9 — `setPreset(B)` aborts all in-flight signals của preset A
    - **Property 9: Preset Switch Cancels All In-Flight Requests**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.5**
    - File: `src/core/basemap/__tests__/BasemapRuntime.test.ts`

- [x] 8. Final checkpoint — toàn bộ test suite
  - Chạy `vitest --run` trên toàn bộ test suite
  - Ensure tất cả tests trong `tileCache.test.ts`, `tilePrefetch.test.ts`, `BasemapRuntime.test.ts`, `basemap-sw.test.ts` pass
  - Ensure không có TypeScript errors trong tất cả các files đã modify/create
  - Ensure `public/basemap-sw.js` không sử dụng ES module syntax (plain JS only)
  - Ask the user if questions arise.

## Notes

- Tasks đánh dấu `*` là optional và có thể skip để đạt MVP nhanh hơn
- Mỗi task tham chiếu specific requirements để traceability
- `public/basemap-sw.js` phải là plain JavaScript (không dùng `import`/`export`) vì SW context không hỗ trợ ES modules một cách đáng tin cậy
- `transparentPngBytes` constant cần được inline trong `basemap-sw.js` (copy từ `tilePlaceholder.ts`) — không thể import
- Test runner: Vitest — dùng `vitest --run` (không dùng watch mode)
- Thứ tự implement quan trọng: `tilePlaceholder.ts` → `tileServiceWorker.ts` → `basemap-sw.js` → `tileCache.ts` → `tilePrefetch.ts` → `BasemapRuntime.ts`
- `registerBasemapTileProtocol` signature thay đổi (thêm optional `options` param) nhưng backward-compatible với callers hiện tại

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "4.1", "4.3", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "4.2", "6.2", "6.3"] },
    { "id": 3, "tasks": ["4.4", "4.5", "4.6", "4.7", "7.1"] },
    { "id": 4, "tasks": ["7.2", "7.3"] },
    { "id": 5, "tasks": ["7.4"] },
    { "id": 6, "tasks": ["7.5", "7.6", "7.7"] }
  ]
}
```
