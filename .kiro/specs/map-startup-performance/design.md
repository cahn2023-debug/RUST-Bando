# Technical Design: Map Startup Performance

## Overview

Spec này tối ưu hoá thời gian khởi động của map viewer từ **~24.5s** xuống còn **< 2000ms** cho `first-feature` milestone và **< 16ms** per RAF frame. Toàn bộ thay đổi nằm ở frontend — không cần sửa Rust backend.

**Nguyên nhân gốc rễ:**
- `openProjectBootstrap` IPC (~24.5s) block toàn bộ pipeline khởi động
- `buildMapLibreFeatureCollection(2887 features)` chạy đồng bộ trong một RAF frame (~84ms)
- `JSON.parse` coordinates được gọi lặp lại trong hot path cho mỗi feature
- 15+ Zustand selector subscriptions riêng lẻ gây re-render dư thừa

**Approach:** fire IPC ngay lập tức (không block), progressive batch rendering, coordinate cache, và gom selectors.

---

## Architecture

### 2.1 Flow hiện tại (trước optimization)

```
App mount → BasemapRuntime.initialize() → map-created (+66ms)
           ↓ (sequential, blocking)
         useProjectManager.loadProjects()
           → IPC: get_active_project + get_recent_projects [Promise.allSettled]
           → IPC: openProjectBootstrap(path)        ← bottleneck ~24.5s
           → useDesignSync.initialize()
           → normalizeMapStateForDisplay()
           → React re-render → MapLibreFastRenderer nhận contextMap
           → project-bind-start (+24593ms)
           → RAF: buildMapLibreFeatureCollection(2887) → source.setData()
           → first-feature (+24636ms)
```

### 2.2 Flow mới (sau optimization)

```
App mount → map-created (+66ms)
           ↓
         parallel:
           [A] openProjectBootstrap(path)   ← fire ngay, không block map init
           [B] BasemapRuntime ready         → project-bind-start sớm hơn
           ↓
         Bootstrap shell ready (~210ms)
           → first progressive batch (200 features) → first-feature (<2000ms)
           → continue loading remaining batches in background (rAF chain)
           ↓
         project-bind-complete (toàn bộ 2887 features rendered)
```

### 2.3 Parallel startup sequence

```typescript
// useProjectManager.ts — khởi động song song
async function loadProjects() {
  const [activeProject, recentProjects] = await Promise.allSettled([
    ipc.get_active_project(),
    ipc.get_recent_projects(),
  ]);

  const path = activeProject.value?.path;
  if (path) {
    // Fire bootstrap ngay — không await ở đây
    const bootstrapPromise = openProjectBootstrap(path);

    // Chuẩn bị UI shell trong khi bootstrap chạy ngầm
    prepareShell(recentProjects.value);

    // Await kết quả khi cần
    const bootstrapData = await bootstrapPromise;
    startTransition(() => initialize(bootstrapData));
  }
}
```

---

## Components and Interfaces

### 3.1 `coordinateCache.ts` (MỚI)

**Vị trí:** `src/modules/design/features/map/coordinateCache.ts`

Module-level cache sử dụng `Map<string, ParsedCoordinates>` để tránh parse lại coordinates trong hot path.

```typescript
type ParsedCoordinates = number[] | number[][] | number[][][] | null;

// Module-level cache — tồn tại giữa renders
const cache = new Map<string, ParsedCoordinates>();

/**
 * Trả về cached result hoặc parse + store nếu chưa có.
 */
export function getCoordinates(
  featureId: string,
  rawCoords: unknown
): ParsedCoordinates {
  if (cache.has(featureId)) {
    return cache.get(featureId)!;
  }
  const parsed = parseRawCoordinates(rawCoords);
  cache.set(featureId, parsed);
  return parsed;
}

/** Xóa cache của một feature khi update/delete. */
export function invalidate(featureId: string): void {
  cache.delete(featureId);
}

/** Clear toàn bộ cache khi đổi project. */
export function invalidateAll(): void {
  cache.clear();
}

/**
 * Pre-parse coordinates trước khi render.
 * Dùng queueMicrotask chain để không block main thread.
 */
export function prePopulate(features: FeatureState[]): Promise<void> {
  return new Promise((resolve) => {
    let index = 0;

    function processNext() {
      if (index >= features.length) {
        resolve();
        return;
      }
      const feature = features[index++];
      if (!cache.has(feature.id)) {
        cache.set(feature.id, parseRawCoordinates(feature.coordinates));
      }
      queueMicrotask(processNext);
    }

    queueMicrotask(processNext);
  });
}

function parseRawCoordinates(raw: unknown): ParsedCoordinates {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ParsedCoordinates;
    } catch {
      return null;
    }
  }
  return raw as ParsedCoordinates;
}
```

**Lý do module-level:** Cache phải được share giữa `ZoomExtendControl` và `mapLibreFastAdapter`, và phải tồn tại giữa các React render cycles. Module-level `Map` là cách đơn giản nhất, không cần Context hay global store.

---

### 3.2 `useProjectManager.ts` (SỬA)

**Vị trí:** `src/modules/implement/hooks/useProjectManager.ts`

Thay đổi chính:
1. Fire `openProjectBootstrap` ngay khi biết path, không chờ sequential chain
2. Wrap `initialize()` trong `startTransition` để React không block rendering

```typescript
import { startTransition } from 'react';
import { invalidateAll } from '../design/features/map/coordinateCache';

async function loadProjects() {
  const [activeResult, recentResult] = await Promise.allSettled([
    ipc.get_active_project(),
    ipc.get_recent_projects(),
  ]);

  const activePath = activeResult.status === 'fulfilled'
    ? activeResult.value?.path
    : undefined;

  // Fire bootstrap ngay lập tức — không block map initialization
  const bootstrapPromise = activePath
    ? openProjectBootstrap(activePath)
    : Promise.resolve(null);

  // Cập nhật recent projects list ngay (không cần đợi bootstrap)
  if (recentResult.status === 'fulfilled') {
    setRecentProjects(recentResult.value);
  }

  // Invalidate coordinate cache khi đổi project
  invalidateAll();

  const bootstrapData = await bootstrapPromise;
  if (bootstrapData) {
    // startTransition: React có thể yield trong quá trình initialize
    startTransition(() => {
      initialize(bootstrapData);
    });
  }
}
```

---

### 3.3 RAF Budget Guard trong `MapLibreFastRenderer.tsx` (SỬA)

**Vị trí:** `src/modules/design/features/map/MapLibreFastRenderer.tsx`

Thêm time-budget check trong RAF: nếu đã dùng > 12ms thì schedule batch tiếp theo qua `requestAnimationFrame`.

```typescript
const RAF_BUDGET_MS = 12; // giữ ~4ms buffer cho browser paint

function processFeatureBatches(
  features: FeatureState[],
  startIndex: number,
  onComplete: () => void
): void {
  const frameStart = performance.now();
  let index = startIndex;

  while (index < features.length) {
    // Kiểm tra budget trước khi xử lý mỗi feature
    if (performance.now() - frameStart > RAF_BUDGET_MS) {
      // Hết budget — schedule phần còn lại vào frame tiếp theo
      requestAnimationFrame(() =>
        processFeatureBatches(features, index, onComplete)
      );
      return;
    }
    processFeature(features[index++]);
  }

  onComplete();
}
```

---

### 3.4 Progressive Loading trong `MapLibreFastRenderer.tsx` (SỬA)

Thay vì render tất cả features cùng lúc, render batch đầu trước để đạt `first-feature` milestone sớm.

```typescript
const FIRST_BATCH_SIZE = 200; // ~2-5ms để process

function renderFeatures(features: FeatureState[], source: MapLibreSource): void {
  if (features.length === 0) return;

  const firstBatch = features.slice(0, FIRST_BATCH_SIZE);
  const remaining = features.slice(FIRST_BATCH_SIZE);

  // Render batch đầu ngay lập tức
  const firstCollection = buildMapLibreFeatureCollection(firstBatch);
  source.setData(firstCollection);
  markMapStartup('first-feature'); // emit milestone

  if (remaining.length === 0) {
    markMapStartup('project-bind-complete');
    return;
  }

  // Schedule các batch còn lại qua rAF chain
  requestAnimationFrame(() => {
    processFeatureBatches(remaining, 0, () => {
      markMapStartup('project-bind-complete');
    });
  });
}
```

---

### 3.5 Combined Selectors trong `MapLibreFastRenderer.tsx` (SỬA)

Gom 15+ selector riêng lẻ thành 3 groups dùng `useShallow` để giảm subscription overhead và re-render dư thừa.

```typescript
import { useShallow } from 'zustand/react/shallow';

// Trước: 15+ subscriptions riêng lẻ
// const features = useDesignSync(s => s.features);
// const groups = useDesignSync(s => s.groups);
// ... (13+ cái nữa)

// Sau: 3 groups
const renderSlice = useDesignSync(
  useShallow((s) => ({
    features: s.features,
    groups: s.groups,
    layers: s.layers,
    selectedFeatureId: s.selectedFeatureId,
    hoverId: s.hoverId,
  }))
);

const editSlice = useDesignSync(
  useShallow((s) => ({
    editingFeatureId: s.editingFeatureId,
    currentDrawingPoints: s.currentDrawingPoints,
    snappedPoint: s.snappedPoint,
  }))
);

const uiSlice = useDesignSync(
  useShallow((s) => ({
    zoomToTrigger: s.zoomToTrigger,
    mapHiddenIds: s.mapHiddenIds,
    visibleFeatureIds: s.visibleFeatureIds,
  }))
);
```

`useShallow` so sánh shallow equality — chỉ re-render khi giá trị thực sự thay đổi, không phải mỗi lần store object reference thay đổi.

---

### 3.6 Layer Initialization Guard trong `MapLibreFastRenderer.tsx` (SỬA)

Đảm bảo `ensureDesignLayers()` chỉ được gọi khi `layerSetupKey` thực sự thay đổi, không gọi lại mỗi RAF frame.

```typescript
const layerSetupKeyRef = useRef<string | null>(null);

// Trong render callback:
const render = useCallback(() => {
  const currentKey = buildLayerSetupKey(mapStyle, projectId);

  // Guard: chỉ setup layers khi key thay đổi
  if (currentKey !== layerSetupKeyRef.current) {
    ensureDesignLayers(map, currentKey);
    layerSetupKeyRef.current = currentKey;
  }

  // Tiếp tục render features...
  renderFeatures(renderSlice.features, source);
}, [renderSlice, mapStyle, projectId]);
```

Trước đây `ensureDesignLayers` có thể được gọi mỗi frame nếu guard không chắc chắn — fix này đảm bảo O(1) per key change, không phải O(n frames).

---

### 3.7 `mapStartupTelemetry.ts` (SỬA)

**Vị trí:** `src/modules/design/features/map/mapStartupTelemetry.ts`

Thêm `project-bind-complete` milestone, RAF violation tracking, và `getStartupReport()`.

```typescript
export type StartupMilestone =
  | 'map-created'
  | 'project-bind-start'
  | 'first-feature'
  | 'project-bind-complete'; // MỚI

const milestones = new Map<StartupMilestone, number>();
const rafViolations: RAFViolation[] = [];
let originTime: number | null = null;

export function markMapStartup(milestone: StartupMilestone): void {
  if (!originTime) originTime = performance.now();
  milestones.set(milestone, performance.now() - originTime);
}

/** Ghi lại RAF frame vượt budget (> 16ms). */
export function recordRAFViolation(
  durationMs: number,
  featureCount: number
): void {
  rafViolations.push({
    durationMs,
    featureCount,
    timestamp: performance.now(),
  });
}

export function getStartupReport(): StartupReport {
  const milestonesObj = Object.fromEntries(milestones) as Record<
    StartupMilestone,
    number
  >;

  const mapCreated = milestones.get('map-created') ?? 0;
  const firstFeature = milestones.get('first-feature') ?? 0;

  return {
    milestones: milestonesObj,
    totalStartupTime: firstFeature - mapCreated,
    rafViolations: [...rafViolations],
  };
}

/** Reset cho test hoặc project reload. */
export function resetTelemetry(): void {
  milestones.clear();
  rafViolations.length = 0;
  originTime = null;
}
```

---

## Data Models

```typescript
/** Kết quả parse coordinates — được cache bởi coordinateCache. */
type ParsedCoordinates = number[] | number[][] | number[][][] | null;

/** Báo cáo đầy đủ startup performance. */
interface StartupReport {
  /** Elapsed ms từ khi originTime được set cho mỗi milestone. */
  milestones: Record<StartupMilestone, number>;
  /** milestones['first-feature'] - milestones['map-created'] */
  totalStartupTime: number;
  /** Danh sách các RAF frame vượt 16ms budget. */
  rafViolations: RAFViolation[];
}

/** Một RAF frame vi phạm time budget. */
interface RAFViolation {
  /** Thời gian thực tế của frame (ms). */
  durationMs: number;
  /** Số features được xử lý trong frame đó. */
  featureCount: number;
  /** performance.now() khi violation xảy ra. */
  timestamp: number;
}

/** Milestones được track trong startup flow. */
type StartupMilestone =
  | 'map-created'
  | 'project-bind-start'
  | 'first-feature'
  | 'project-bind-complete';
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| `openProjectBootstrap` IPC fail | Log lỗi, set trạng thái lỗi trong store, hiển thị thông báo cho user |
| `openProjectBootstrap` timeout > 30s | Hủy promise, hiển thị lỗi timeout (R1.5) |
| `getCoordinates` gặp invalid JSON string | Return `null`, log warning, feature bị skip khỏi render |
| RAF budget exceeded | Ghi `RAFViolation` vào telemetry, defer batch sang frame tiếp theo |
| `startTransition` bị cancel | React tự động retry khi có tài nguyên; không cần xử lý thủ công |
| IPC parallel call thất bại một phần | Log lỗi call cụ thể, tiếp tục với các call thành công (R2.5) |
| Cache `invalidateAll()` thiếu sót | CoordinateCache được clear tường minh khi project change — nếu stale, worst case là parse lại 1 lần |

---

## Correctness Properties

### Property 1: CoordinateCache Round-Trip
*For any* feature với `rawCoords` là JSON string hợp lệ, `getCoordinates(feature.id, rawCoords)` SHALL trả về giá trị bằng `JSON.parse(rawCoords)` về mặt deep equality.

**Validates: Requirements 3.6**

### Property 2: CoordinateCache No Double Parse
*For any* feature ID đã được `getCoordinates()` gọi ít nhất một lần, lần gọi tiếp theo SHALL không gọi `JSON.parse` — verify bằng mock và call count assertion.

**Validates: Requirements 3.1, 3.2**

### Property 3: Telemetry Report Consistency
*For all* startup sessions, `getStartupReport().totalStartupTime` SHALL bằng `milestones['first-feature'] - milestones['map-created']` — tính bất biến này phải đúng với mọi thứ tự gọi `markMapStartup`.

**Validates: Requirements 7.7**

### Property 4: Progressive Batch Completeness
*For any* `FeatureCollection` có N features, sau khi toàn bộ batches được render, tổng số features được pass vào `source.setData` SHALL bằng N và mỗi feature xuất hiện đúng một lần.

**Validates: Requirements 8.1, 8.3**

### Property 5: RAF Budget Invariant
*For any* call `processFeatureBatches(features, startIndex)`, thời gian từ khi hàm bắt đầu đến khi hàm return (không tính callback sang frame tiếp theo) SHALL ≤ `RAF_BUDGET_MS` (12ms).

**Validates: Requirements 4.1, 4.2**

---

## Key Design Decisions

### Decision 1: Không dùng Web Worker cho `buildMapLibreFeatureCollection`

Web Worker yêu cầu serialize/deserialize toàn bộ feature data qua structured clone — với 2887 features có thể tốn 10-30ms chỉ cho serialization, chưa tính postMessage latency. Overhead này có thể counterproductive so với lợi ích off-main-thread.

**Thay vào đó:** time-budget chunking trong RAF. Mỗi frame chỉ xử lý tối đa 12ms, phần còn lại được defer sang frame tiếp theo. Cách này đơn giản hơn nhiều (không cần postMessage protocol, không cần SharedArrayBuffer, không cần worker lifecycle management) và đạt được kết quả tương đương — main thread không bị block quá 12ms trong bất kỳ frame nào.

### Decision 2: CoordinateCache ở module level, không phải component state

Cache cần được share giữa hai consumer độc lập: `ZoomExtendControl` (parse cho zoom bounds) và `mapLibreFastAdapter` (parse cho feature rendering). Nếu đặt trong React state/context thì cần wrapping phức tạp và vẫn có nguy cơ bị reset khi re-render.

Module-level `Map` là đơn giản nhất: zero React overhead, tự nhiên shared giữa mọi consumer trong cùng module graph, và có thể invalidate tường minh khi project thay đổi bằng `invalidateAll()`.

### Decision 3: Progressive batch size = 200

Trade-off giữa `first-feature` latency và render choppiness:

| Batch size | Thời gian process (ước tính) | Trải nghiệm |
|---|---|---|
| 50 | ~0.5ms | first-feature rất nhanh nhưng thấy nhiều lần re-render |
| 200 | ~2-5ms | Cân bằng tốt, không bị flicker |
| 500 | ~10ms | Gần hết RAF budget, rủi ro jank |
| 2887 (tất cả) | ~84ms | Hành vi hiện tại — block toàn bộ frame |

200 features đủ để map trông có nội dung ngay lập tức (không blank), và ~2-5ms process time đảm bảo không vượt RAF budget ngay cả khi có overhead khác trong frame.

---

## File Change Summary

| File | Loại thay đổi | Mô tả |
|------|--------------|-------|
| `src/modules/design/features/map/coordinateCache.ts` | **Mới** | Module-level coordinate parse cache với O(1) lookup, `prePopulate` qua microtask chain |
| `src/modules/implement/hooks/useProjectManager.ts` | Sửa | Fire `openProjectBootstrap` sớm song song, wrap `initialize()` với `startTransition` |
| `src/modules/design/features/map/MapLibreFastRenderer.tsx` | Sửa | Progressive batch loading (first 200), combined selectors với `useShallow`, RAF budget guard |
| `src/modules/design/features/map/MapLayerComponents/ZoomExtendControl.tsx` | Sửa | Thay inline `JSON.parse` bằng `getCoordinates()` từ `coordinateCache` |
| `src/modules/design/features/map/mapLibreFastAdapter.ts` | Sửa | Thay `JSON.parse` coordinates trong `toRenderFeatures()` bằng `coordinateCache` |
| `src/modules/design/features/map/mapStartupTelemetry.ts` | Sửa | Thêm `project-bind-complete` milestone, `getStartupReport()`, `recordRAFViolation()` |

---

## Testing Strategy

### Unit Tests

**`coordinateCache.test.ts`**
- Round-trip: `getCoordinates` trả về đúng parsed value từ raw string
- Cache hit: gọi lần 2 không gọi `JSON.parse` nữa (mock JSON.parse, verify call count)
- Invalidation: sau `invalidate(id)`, lần gọi tiếp theo re-parse
- `invalidateAll`: cache rỗng hoàn toàn sau khi gọi
- `prePopulate`: sau khi resolve, tất cả feature IDs có trong cache

**`mapStartupTelemetry.test.ts`**
- Report consistency: `totalStartupTime === milestones['first-feature'] - milestones['map-created']` với mọi input (property-based test — R7.7)
- RAF violation recording: violations được ghi đúng thứ tự và không mutate sau khi report được trả về
- Reset: sau `resetTelemetry()`, `getStartupReport()` trả về empty state

### Integration Tests

**`MapLibreFastRenderer` render count**
- Mount component với 2887 features → số lần `source.setData` gọi phải ≤ 2 trên initial mount (1 cho first batch, 1 aggregate sau khi hết batches)
- Thay đổi một selector (ví dụ `selectedFeatureId`) không trigger full re-render

### Performance Benchmark

```typescript
// vitest bench — chạy với vitest benchmark
bench('buildMapLibreFeatureCollection batched (2887 features)', async () => {
  const features = generateMockFeatures(2887);
  await renderAllBatches(features); // total across all rAF frames
}, { time: 1000 });
// Target: tổng thời gian < 50ms (spread across frames, mỗi frame < 12ms)
```

---

## Risk & Rollback

| Rủi ro | Mức độ | Mitigations |
|--------|--------|-------------|
| `openProjectBootstrap` fire quá sớm trước khi path available | Thấp | Guard `if (activePath)` trước khi fire |
| Progressive render gây flicker trên máy nhanh | Thấp | FIRST_BATCH_SIZE = 200 đủ lớn để không thấy blank frame |
| `coordinateCache` stale sau hot-reload dev | Thấp | `invalidateAll()` được gọi khi project change; dev HMR trigger re-mount |
| `startTransition` defer `initialize()` quá lâu | Trung bình | React chỉ defer khi có concurrent work khác — monitor với Profiler |

**Rollback:** Mỗi thay đổi là độc lập. Có thể revert từng file riêng lẻ mà không ảnh hưởng các file khác.
