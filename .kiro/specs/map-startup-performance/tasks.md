# Implementation Plan: Map Startup Performance

## Overview

Tối ưu hóa startup pipeline của map viewer: giảm `first-feature` từ ~24.6s xuống < 2000ms và RAF frame từ 84ms xuống < 16ms. Gồm 6 nhóm công việc: tạo `coordinateCache.ts`, sửa telemetry, sửa `useProjectManager`, sửa `mapLibreFastAdapter` + `ZoomExtendControl`, sửa `MapLibreFastRenderer` (progressive loading + combined selectors + RAF guard), và viết tests.

## Tasks

- [x] 1. Tạo `coordinateCache.ts` và cập nhật telemetry
  - [x] 1.1 Tạo `src/modules/design/features/map/coordinateCache.ts`
    - Export `type ParsedCoordinates = number[] | number[][] | number[][][] | null`
    - Module-level `const cache = new Map<string, ParsedCoordinates>()`
    - Export `getCoordinates(featureId: string, rawCoords: unknown): ParsedCoordinates` — cache hit hoặc parse + store
    - Export `invalidate(featureId: string): void` — `cache.delete(featureId)`
    - Export `invalidateAll(): void` — `cache.clear()`
    - Export `prePopulate(features: FeatureState[]): Promise<void>` — dùng `queueMicrotask` chain, không block main thread
    - Private `parseRawCoordinates(raw: unknown): ParsedCoordinates` — `typeof raw === 'string'` → `JSON.parse`, fallback `null`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.2 Cập nhật `src/modules/design/features/map/mapStartupTelemetry.ts`
    - Thêm `'project-bind-complete'` vào `StartupMilestone` type
    - Export `interface RAFViolation { durationMs: number; featureCount: number; timestamp: number }`
    - Export `interface StartupReport { milestones: Record<StartupMilestone, number>; totalStartupTime: number; rafViolations: RAFViolation[] }`
    - Export `recordRAFViolation(durationMs: number, featureCount: number): void` — push vào module-level array
    - Export `getStartupReport(): StartupReport` — `totalStartupTime = milestones['first-feature'] - milestones['map-created']`
    - Export `resetTelemetry(): void` — clear milestones, rafViolations, reset originTime
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7_

- [x] 2. Sửa IPC bootstrap chain trong `useProjectManager.ts`
  - [x] 2.1 Song song hóa IPC và wrap `initialize()` với `startTransition`
    - Import `startTransition` từ `'react'`
    - Import `invalidateAll` từ `coordinateCache`
    - Trong `loadProjects`: giữ `Promise.allSettled([get_active_project, get_recent_projects])` hiện có
    - Sau khi có `activePath`: gọi `openProjectBootstrap(activePath)` ngay — **không await ngay** (fire sớm)
    - Cập nhật recent projects và selectedProject state ngay mà không chờ bootstrap
    - Gọi `invalidateAll()` trước khi `initialize()`
    - Wrap `currentSyncState.initialize(...)` trong `startTransition(() => { ... })`
    - Preserve tất cả guards hiện có: `requestId`, `startupHydrationInFlight`, `isAlreadyLoaded`
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

  - [x] 2.2 Thêm timeout guard 30s cho `openProjectBootstrap`
    - Wrap `openProjectBootstrap` call với `Promise.race([bootstrapPromise, timeoutPromise(30_000)])`
    - Nếu timeout: log cảnh báo, set error state trong store, return sớm
    - _Requirements: 1.5_

- [x] 3. Sửa `mapLibreFastAdapter.ts` và `ZoomExtendControl.tsx` — dùng coordinateCache
  - [x] 3.1 Sửa `mapLibreFastAdapter.ts` — thay `JSON.parse` coordinates bằng `coordinateCache`
    - Import `getCoordinates` từ `'./coordinateCache'`
    - Trong `toRenderFeatures()`: thay `typeof rawCoords === 'string' ? JSON.parse(rawCoords) : rawCoords` bằng `getCoordinates(feature.id, rawCoords)`
    - Tương tự trong `geometryInputForFeature()` hoặc bất kỳ nơi nào parse raw coords
    - Không thay đổi output types hay function signatures
    - _Requirements: 3.1, 3.2_

  - [x] 3.2 Sửa `ZoomExtendControl.tsx` — thay `JSON.parse` trong RAF bằng `coordinateCache`
    - Import `getCoordinates` từ `'../coordinateCache'`
    - Trong RAF callback, thay:
      ```typescript
      const coords = typeof rawCoords === 'string'
          ? (rawCoords.trim().startsWith('[') ? JSON.parse(rawCoords) : null)
          : rawCoords;
      ```
      bằng `const coords = getCoordinates(f.id, rawCoords)`
    - Không thay đổi bounds calculation logic
    - _Requirements: 3.1, 3.2_

- [x] 4. Sửa `MapLibreFastRenderer.tsx` — progressive loading, RAF budget guard, combined selectors
  - [x] 4.1 Thêm `FIRST_BATCH_SIZE = 200` constant và progressive render logic
    - Thêm `const FIRST_BATCH_SIZE = 200` ở đầu file
    - Tạo `renderFeaturesBatched(features, source, onFirstBatch, onComplete)`:
      - Render `features.slice(0, FIRST_BATCH_SIZE)` ngay: `source.setData(firstCollection)`
      - Gọi `onFirstBatch()` → emit `markMapStartup('first-feature')`
      - Nếu không có remaining: gọi `onComplete()` → `markMapStartup('project-bind-complete')`
      - Nếu có remaining: `requestAnimationFrame(() => processFeatureBatches(remaining, 0, onComplete))`
    - Thay call `source.setData(displayCollection)` hiện tại bằng `renderFeaturesBatched(...)`
    - _Requirements: 5.1, 5.2, 5.4, 1.1, 1.2_

  - [x] 4.2 Thêm RAF time-budget guard trong `processFeatureBatches`
    - Thêm `const RAF_BUDGET_MS = 12`
    - Implement `processFeatureBatches(features, startIndex, onComplete)`:
      - `const frameStart = performance.now()`
      - Loop: check `performance.now() - frameStart > RAF_BUDGET_MS` trước mỗi feature → nếu vượt, `requestAnimationFrame(() => processFeatureBatches(features, index, onComplete))` và return
      - Sau loop: gọi `onComplete()`
    - Sau mỗi frame, check nếu `durationMs > 16`: gọi `recordRAFViolation(durationMs, featureCount)`
    - _Requirements: 4.1, 4.2, 4.5, 7.5_

  - [x] 4.3 Gom 15+ `useDesignSync` selectors thành 3 combined selectors với `useShallow`
    - Import `useShallow` từ `'zustand/react/shallow'`
    - Tạo `renderSlice = useDesignSync(useShallow(s => ({ features, groups, layers, selectedFeatureId, hoverId, ... })))` — các field liên quan đến render geometry
    - Tạo `editSlice = useDesignSync(useShallow(s => ({ editingFeatureId, currentDrawingPoints, snappedPoint, ... })))` — các field liên quan đến editing
    - Tạo `uiSlice = useDesignSync(useShallow(s => ({ zoomToTrigger, mapHiddenIds, visibleFeatureIds, ... })))` — các field UI/viewport
    - Cập nhật tất cả usages trong component để dùng `renderSlice.X`, `editSlice.X`, `uiSlice.X`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 4.4 Đảm bảo `ensureDesignLayers` chỉ gọi khi `layerSetupKey` thay đổi
    - Verify `layerSetupKeyRef` guard hiện có hoạt động đúng — `ensureDesignLayers` KHÔNG được gọi khi key không đổi
    - Nếu guard bị bypass trong bất kỳ code path nào, fix để đảm bảo early return khi `currentKey === layerSetupKeyRef.current`
    - _Requirements: 4.3_

  - [x] 4.5 Thêm `project-bind-complete` milestone và progress tracking
    - Tạo `progressState = { rendered: number, total: number }` để track batch progress
    - Mỗi batch complete: cập nhật progress state
    - Khi toàn bộ batches done: gọi `markMapStartup('project-bind-complete')`
    - Expose progress qua state để loading indicator có thể subscribe (R5.3)
    - _Requirements: 5.3, 5.4, 7.1_

- [x] 5. Viết tests
  - [x] 5.1 Viết unit tests cho `coordinateCache.ts`
    - Test round-trip: `getCoordinates(id, '[1,2]')` → `[1, 2]` (deep equal với `JSON.parse('[1,2]')`)
    - Test cache hit: mock `JSON.parse`, call `getCoordinates` 2 lần với cùng id → `JSON.parse` chỉ được gọi 1 lần
    - Test `invalidate`: sau `invalidate(id)`, gọi lại `getCoordinates` → re-parse (JSON.parse được gọi lại)
    - Test `invalidateAll`: sau gọi, cache.size = 0
    - Test `prePopulate`: sau resolve, tất cả feature IDs đều có trong cache
    - Test null/invalid input: `getCoordinates(id, null)` → null, `getCoordinates(id, 'invalid json')` → null
    - File: `src/modules/design/features/map/__tests__/coordinateCache.test.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

  - [x] 5.2 Viết unit tests cho `mapStartupTelemetry.ts`
    - **Property test — Report Consistency (R7.7)**: với bất kỳ thứ tự gọi `markMapStartup`, `getStartupReport().totalStartupTime === report.milestones['first-feature'] - report.milestones['map-created']`
    - Test `recordRAFViolation`: violations xuất hiện trong report với đúng values
    - Test immutability: mutate kết quả của `getStartupReport().rafViolations` không ảnh hưởng internal state
    - Test `resetTelemetry`: report trả về `{ milestones: {}, totalStartupTime: 0, rafViolations: [] }` sau reset
    - File: `src/modules/design/features/map/__tests__/mapStartupTelemetry.test.ts`
    - _Requirements: 7.3, 7.6, 7.7_

  - [x] 5.3 Viết unit tests cho progressive batch logic
    - Test batch completeness: với N features, tổng features passed to `source.setData` = N, không trùng lặp, không bỏ sót
    - Test first batch: `source.setData` được gọi với batch đầu (≤ 200 features) trước khi `requestAnimationFrame` được schedule
    - Test `project-bind-complete` milestone: được emit sau khi batch cuối hoàn thành
    - File: `src/modules/design/features/map/__tests__/MapLibreFastRenderer.test.ts`
    - _Requirements: 5.1, 5.2, 5.4, 8.1, 8.3_

- [x] 6. Final checkpoint
  - Chạy TypeScript compiler: `tsc --noEmit` — không có errors trong tất cả files đã sửa
  - Chạy `vitest --run` — tất cả tests trong `coordinateCache.test.ts`, `mapStartupTelemetry.test.ts`, `MapLibreFastRenderer.test.ts` pass
  - Verify `mapStartupTelemetry.ts` export đủ: `markMapStartup`, `recordRAFViolation`, `getStartupReport`, `resetTelemetry`, types `StartupReport`, `RAFViolation`
  - Verify `coordinateCache.ts` export đủ: `getCoordinates`, `invalidate`, `invalidateAll`, `prePopulate`, type `ParsedCoordinates`

## Notes

- Thứ tự implement quan trọng: `coordinateCache.ts` + telemetry → `mapLibreFastAdapter` + `ZoomExtendControl` → `useProjectManager` → `MapLibreFastRenderer`
- `coordinateCache` là module-level (không phải React state) — tồn tại giữa renders, shared giữa tất cả consumers
- `startTransition` wrap chỉ có tác dụng trong React 18+ Concurrent mode — app đã dùng React 18 nên OK
- Progressive batch size 200 có thể tune sau khi đo thực tế — đặt là constant để dễ điều chỉnh
- Không sửa Rust backend trong spec này
- Test runner: Vitest — dùng `vitest --run` (không dùng watch mode)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "3.1", "3.2"] },
    { "id": 2, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 4, "tasks": ["6"] }
  ]
}
```
