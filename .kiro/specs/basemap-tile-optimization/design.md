# Design Document — Basemap Tile Optimization

## Overview

Refactor the basemap tile loading pipeline of a React + TypeScript + MapLibre GL 5.x + Tauri 2.x desktop/browser app to eliminate blank/missing tiles across all scenarios. The design introduces:

1. A unified Service Worker cache (L1) layered on top of the existing Rust on-disk cache (L2)
2. Retry logic with exponential backoff at the tile-fetch level
3. Hard timeout enforcement via `AbortController`
4. Race-condition-free preset switching (cancel in-flight, drop `source.reload()`)
5. Extended prefetch coverage (z0–z12)
6. Offline placeholder PNG
7. Structured error logging and auto-recovery

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         MapLibre GL                          │
│  tile request → basemap:// protocol handler                  │
└────────────────────────┬─────────────────────────────────────┘
                         │
          ┌──────────────▼──────────────┐
          │    TileServiceWorker (L1)    │  basemap-tiles-v1 cache
          │    Cache-first + LRU 5000   │
          └──────────────┬──────────────┘
                         │ miss
          ┌──────────────▼──────────────┐
          │    Rust IPC L2 cache        │  (Tauri desktop only)
          │    get_basemap_tile         │
          └──────────────┬──────────────┘
                         │ miss
          ┌──────────────▼──────────────┐
          │   Direct HTTPS fetch +      │
          │   timeout + retry backoff   │
          └─────────────────────────────┘
```

The protocol handler in `tileCache.ts` is the single entry point for all tile bytes. Adding the SW intercept layer above it means existing Tauri L2 logic is untouched; browser mode gains caching for the first time.

---

## Components

### 1. `tileServiceWorker.ts` — SW Registration

Registers `basemap-sw.js` from the app's static root. Exports `registerTileServiceWorker()` called from the app's entry point (or `BasemapRuntime.initialize()`).

```typescript
// src/core/basemap/tileServiceWorker.ts

/** Register the basemap Service Worker. Resolves when the SW controls the page. */
export async function registerTileServiceWorker(): Promise<void> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
        const reg = await navigator.serviceWorker.register('/basemap-sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        console.debug('[BasemapSW] registered', reg.scope);
    } catch (err) {
        console.warn('[BasemapSW] registration failed — proceeding without SW cache', err);
    }
}
```

Registration is non-blocking: failure logs a warning and the app continues to fetch tiles directly.

---

### 2. `basemap-sw.js` — Service Worker Script

Runs inside the SW context. Intercepts all `fetch` events whose URL matches the Google Maps tile pattern. Implements:

- **Cache-first strategy**: check `basemap-tiles-v1` → return; else fetch → store → return.
- **LRU eviction**: maintain a metadata entry (key `basemap-lru-meta`) storing an ordered list of cached URLs. On each insert, append to LRU list; when `size > MAX_TILES` (default 5 000), evict the front of the list.
- **Offline placeholder**: when fetch fails and no cached entry exists, return a 256 × 256 transparent PNG.
- **L1/L2 bridge in Tauri**: for `basemap://` URLs, the SW is not involved (protocol handler runs in the main thread). The SW only intercepts plain `https://mt[0-3].google.com/vt/*` requests.

```javascript
// public/basemap-sw.js  (plain JS — SW context cannot use ES modules reliably)

const CACHE_NAME = 'basemap-tiles-v1';
const LRU_META_KEY = 'basemap-lru-meta';
const MAX_TILES = 5000;
const TILE_URL_PATTERN = /^https:\/\/mt[0-3]\.google\.com\/vt\//;

self.addEventListener('fetch', (event) => {
    if (!TILE_URL_PATTERN.test(event.request.url)) return;
    event.respondWith(handleTileRequest(event.request));
});

async function handleTileRequest(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
        await touchLru(request.url);
        return cached;
    }
    try {
        const response = await fetch(request);
        if (response.ok) {
            await cache.put(request, response.clone());
            await insertLru(request.url, cache);
        }
        return response;
    } catch (_err) {
        console.debug('[BasemapSW] tile-offline-placeholder', request.url);
        return new Response(TRANSPARENT_PNG, {
            headers: { 'Content-Type': 'image/png' },
        });
    }
}

// LRU helpers omitted for brevity — see tilePlaceholder section for PNG constant.
```

---

### 3. `tilePlaceholder.ts` — Transparent PNG

Generates the 256 × 256 transparent PNG returned when a tile is unavailable offline. Stored as a base64 constant (136 bytes — minimal IHDR + IEND with 1 transparent pixel scaled to 256).

```typescript
// src/core/basemap/tilePlaceholder.ts

/** Minimal 1×1 transparent PNG, sufficient for MapLibre's tile consumer. */
export const TRANSPARENT_PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ' +
    'AAbjbOmQAAAABJRU5ErkJggg==';

export function transparentPngBytes(): Uint8Array {
    const binary = atob(TRANSPARENT_PNG_B64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export function transparentPngResponse(): Response {
    return new Response(transparentPngBytes(), {
        headers: { 'Content-Type': 'image/png', 'X-Basemap-Placeholder': '1' },
    });
}
```

The `basemap-sw.js` bundles the same constant inline (no import) because SW scripts cannot `import` from src.

---

### 4. `tileCache.ts` — Retry, Timeout, Stale-Source Cleanup

#### 4a. `TileRetryQueue`

```typescript
interface RetryEntry {
    url: string;
    sourceKey: string;
    z: number; x: number; y: number;
    attempts: number;
    lastStatus?: number;
}

const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_RATE_LIMIT_DELAY_MS = 5000;
```

Retry policy (applied inside `loadThroughCache`):

| Condition | Action |
|---|---|
| Network error or 5xx | Enqueue; backoff 1 s → 2 s → 4 s |
| 4xx (except 429) | Log and give up |
| 429 | Retry after `max(5000, Retry-After * 1000)` ms |
| 3 attempts exhausted | Log structured entry; serve placeholder |

#### 4b. Timeout Enforcement

`loadThroughCache` accepts `timeoutMs` from `BasemapRuntimeConfig` (passed at registration time). Every `fetch()` call wraps with an `AbortController`:

```typescript
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}
```

Default: 10 000 ms when `tileRequestTimeoutMs` is 0 or absent.

#### 4c. Stale-Source Cleanup

`clearSourceKey(key: string)` removes a `SourceKey` from the `sources` Map. Called by `BasemapRuntime.setPreset()` before registering the new source, ensuring that tiles from the previous preset cannot be served from a stale registry entry.

```typescript
export function clearSourceKey(key: string): void {
    sources.delete(key);
}
```

---

### 5. `BasemapRuntime.ts` — Race-Condition-Free Preset Switching + Recovery

#### 5a. Preset Switching (no `source.reload()`)

```typescript
setPreset(presetId: BasemapPresetId, preferences: Partial<BasemapPreferences> = {}): void {
    // Cancel in-flight prefetch for old preset
    this.cancelPrefetch?.();
    this.cancelPrefetch = null;

    // Cancel in-flight tile requests (abort controller per preset epoch)
    this.tileAbortController?.abort();
    this.tileAbortController = new AbortController();

    const previousKey = deriveTileSourceKey(this.presetId, getStyledBasemapTiles(this.presetId, this.preferences));
    clearSourceKey(previousKey);

    this.presetId = presetId;
    this.preferences = { ...this.preferences, ...preferences, presetId };

    if (!this.map) {
        this.config = { ...this.config, initialPresetId: presetId };
        storePreferences(this.getPreferences());
        this.emitPreset();
        return;
    }

    const applyPreset = () => {
        const source = this.map!.getSource(BASEMAP_SOURCE_ID) as { setTiles?: (t: string[]) => void } | undefined;
        source?.setTiles?.(this.resolveTileUrls());
        // ← NO source.reload() call here

        if (this.lifecycleState === 'degraded') this.setLifecycleState('interactive');
        storePreferences(this.getPreferences());
        this.emitPreset();

        this.cancelPrefetch = scheduleBasemapPrefetch({
            presetId: this.presetId,
            preferences: this.preferences,
        });
    };

    if (this.lifecycleState === 'interactive') {
        applyPreset();
    } else {
        this.map.once('render', applyPreset);
    }
}
```

Key changes vs current code:
- `source.reload()` is removed.
- `setTiles()` is only called — MapLibre re-requests tiles automatically after URL change.
- Queued application via `map.once('render', ...)` when not yet interactive.
- Previous source key is cleared from the registry.
- `tileAbortController` cancels any in-flight protocol-handler fetch for the old preset epoch.

#### 5b. Error Handler and Auto-Recovery

```typescript
private recoveryAttempts = 0;
private degradedAt: number | null = null;
private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

private handleMapError(event: any): void {
    const sourceId = event?.sourceId || event?.source?.id;
    if (sourceId && sourceId !== BASEMAP_SOURCE_ID) return;

    const now = Date.now();
    if (this.lifecycleState !== 'degraded') {
        this.degradedAt = now;
        this.recoveryAttempts = 0;
    }
    this.setLifecycleState('degraded');
    this.scheduleRecovery();
}

private scheduleRecovery(): void {
    if (this.recoveryTimer !== null) return;
    this.recoveryTimer = setTimeout(() => {
        this.recoveryTimer = null;
        this.attemptRecovery();
    }, 3000);
}

private attemptRecovery(): void {
    if (!this.map) return;
    if (this.recoveryAttempts >= 3) {
        this.setLifecycleState('failed');
        console.error('[Basemap] recovery-failed', {
            attempts: this.recoveryAttempts,
            degradedAt: this.degradedAt,
        });
        return;
    }
    this.recoveryAttempts += 1;
    const source = this.map.getSource(BASEMAP_SOURCE_ID) as { reload?: () => void } | undefined;
    source?.reload?.();
}
```

When a `map.on('error')` fires for the basemap source:
1. Lifecycle → `degraded` (synchronous, notifies listeners immediately).
2. Recovery timer fires after 3 000 ms → calls `source.reload()`.
3. If `render` fires after reload, lifecycle returns to `interactive`; the recovery-duration log entry is emitted.
4. If the error fires again (recovery failed), `recoveryAttempts` increments; after 3 consecutive failures → `failed`.

#### 5c. Recovery Transition Logging

```typescript
private setLifecycleState(state: BasemapLifecycleState): void {
    const prev = this.lifecycleState;
    this.lifecycleState = state;
    // Recovery completion log
    if (prev === 'degraded' && state === 'interactive' && this.degradedAt !== null) {
        console.info('[Basemap] lifecycle-recovered', {
            durationMs: Date.now() - this.degradedAt,
        });
        this.degradedAt = null;
        this.recoveryAttempts = 0;
    }
    // Synchronous notification — no setTimeout, no microtask
    this.lifecycleListeners.forEach(listener => listener(state));
}
```

---

### 6. `tilePrefetch.ts` — Extended Coverage

Changes from current code:

| Field | Before | After |
|---|---|---|
| `PREFETCH_MAX_ZOOM` | `8` (hardcoded) | `12` (default, overridable via `maxZoom` param) |
| `MAX_PREFETCH_TILES` | `1200` | `1200` (unchanged) |
| `enumerateTiles` limit | truncates at limit | same; lower z-levels always fill first due to loop order |

The `scheduleBasemapPrefetch` and `prefetchBasemapTiles` signatures are unchanged; callers that already pass `maxZoom` continue to work, and the new default covers z0–z12 per Requirement 5.2.

---

## Data Models

### `TileLoadError` (structured log entry)

```typescript
interface TileLoadError {
    z: number;
    x: number;
    y: number;
    url: string;
    status: number | null;   // null for network errors (no HTTP response)
    message: string;
    timestamp: string;        // ISO 8601
}
```

### `RetryEntry` (in-memory only, not persisted)

```typescript
interface RetryEntry {
    url: string;
    sourceKey: string;
    z: number;
    x: number;
    y: number;
    attempts: number;
    lastStatus?: number;
}
```

### `PrefetchReport` (unchanged from current `tilePrefetch.ts`)

```typescript
interface PrefetchReport {
    requested: number;
    cached: number;
    fetched: number;
    failed: number;
}
```

---

## Interfaces

### `TileProtocolHandlerOptions`

Passed from `BasemapRuntime.initialize()` to `registerBasemapTileProtocol()`:

```typescript
export interface TileProtocolHandlerOptions {
    timeoutMs: number;   // defaults to 10_000 if 0 or absent
}
```

### Updated `toCachedTileUrls` signature

No signature change — the timeout is passed globally at registration time via `registerBasemapTileProtocol(options)` once, rather than per-call.

---

## Error Handling

| Scenario | Handling |
|---|---|
| SW registration fails | `console.warn` + direct fetch fallback |
| Tile request times out | `AbortController.abort()` → treated as network error → retry queue |
| Tile 4xx (not 429) | Log + give up immediately |
| Tile 429 | Retry after `max(5000ms, Retry-After)` |
| All 3 retries fail | Structured `TileLoadError` log + placeholder PNG |
| Offline + no cache | Transparent PNG placeholder + `console.debug` tile-offline-placeholder event |
| MapLibre error event on basemap source | Lifecycle → `degraded` → recovery after 3 s |
| 3 consecutive recovery failures | Lifecycle → `failed` + structured error log |
| Preset switched while loading | Previous AbortController aborted; stale sourceKey cleared |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: SW Cache Intercept

*For any* Google Maps tile URL (`https://mt[0-3].google.com/vt/*`), the Service Worker fetch handler shall be invoked before any direct network call is made when the SW is active.

**Validates: Requirements 1.2**

---

### Property 2: Cache Round-Trip

*For any* tile URL that returns a successful HTTP response, after the Service Worker fetch handler processes the response, that URL shall be retrievable from the `basemap-tiles-v1` cache partition and the stored bytes shall be identical to the original response body.

**Validates: Requirements 1.3, 1.4**

---

### Property 3: LRU Eviction Invariant

*For any* sequence of unique tile URLs inserted into the `basemap-tiles-v1` cache where the sequence length exceeds `MAX_TILES`, the total number of entries in the cache shall never exceed `MAX_TILES`, and the entries present shall always be the most recently accessed ones.

**Validates: Requirements 1.6**

---

### Property 4: Two-Level Cache Ordering

*For any* tile request in a Tauri desktop context, if the tile is present in the L1 Service Worker cache, the Rust IPC L2 cache shall not be consulted; if absent from L1, L2 shall be consulted before a direct network fetch.

**Validates: Requirements 1.7**

---

### Property 5: Retry Queue Membership and Exhaustion

*For any* tile request that fails with a network error or HTTP 5xx status, the tile shall be present in the `TileRetryQueue` with `attempts < 3` after each failure, and the pipeline shall attempt exactly 3 total retries before giving up; *for any* tile that fails with HTTP 4xx (excluding 429), the pipeline shall make exactly 0 additional attempts beyond the original request.

**Validates: Requirements 2.1, 2.2, 2.5**

---

### Property 6: Retry Success Removes from Queue

*For any* tile in the `TileRetryQueue` that eventually succeeds on retry attempt N (1 ≤ N ≤ 3), the queue shall contain no entry for that tile after the success, and the tile bytes shall have been delivered to the caller.

**Validates: Requirements 2.3**

---

### Property 7: Retry Failure Structured Log

*For any* tile that exhausts all 3 retries, the emitted log entry shall contain all five fields: `z`, `x`, `y`, `url`, `status`, `message`, and `timestamp`.

**Validates: Requirements 2.4, 7.1**

---

### Property 8: Timeout Aborts Request

*For any* tile fetch where the response does not arrive within `tileRequestTimeoutMs` milliseconds, `AbortController.abort()` shall be called and the resulting error shall be classified as a network error (triggering the retry queue).

**Validates: Requirements 3.1, 3.2**

---

### Property 9: Preset Switch Cancels All In-Flight Requests

*For any* set of in-flight tile requests belonging to preset A, calling `setPreset(B)` shall cause all of those requests' `AbortSignal` instances to be in the aborted state before the new tile URLs are applied.

**Validates: Requirements 4.1**

---

### Property 10: Stale SourceKey Cleared on Preset Switch

*For any* preset A with derived `SourceKey` K_A, after calling `setPreset(B)` where B ≠ A, the `sources` registry in `tileCache.ts` shall contain no entry for K_A.

**Validates: Requirements 4.4**

---

### Property 11: Offline Cache Hit

*For any* tile URL that is present in the `basemap-tiles-v1` cache partition, while the network is unavailable, the Service Worker shall return the cached response with a 200 status and the correct `Content-Type: image/png`.

**Validates: Requirements 6.1**

---

### Property 12: Offline Placeholder for Cache Miss

*For any* tile URL that is absent from all cache layers while the network is unavailable, the pipeline shall return a valid 256 × 256 transparent PNG response and emit a `console.debug` entry containing the tile coordinates `(z, x, y)`.

**Validates: Requirements 6.2, 6.4**

---

### Property 13: Lifecycle Listeners Notified Synchronously

*For any* lifecycle state transition, all functions registered via `subscribeLifecycle` shall be invoked with the new state before the `setLifecycleState` call returns to its caller.

**Validates: Requirements 7.6**

---

### Property 14: Recovery Exhaustion Leads to Failed State

*For any* sequence of 3 consecutive map error events on `BASEMAP_SOURCE_ID` where each recovery attempt (source.reload) is followed by another error event, the lifecycle state shall transition to `failed` after the third failed recovery, and a structured error log entry shall be emitted.

**Validates: Requirements 7.4**

---

### Property 15: Prefetch Zoom Bound

*For any* `maxZoom` value M passed to `enumerateTiles`, every tile coordinate in the returned array shall satisfy `z ≤ M`, and if the resulting tile count exceeds `MAX_PREFETCH_TILES`, the array length shall be exactly `MAX_PREFETCH_TILES` with tiles from lower zoom levels appearing before tiles from higher zoom levels.

**Validates: Requirements 5.1, 5.4**

---

### Property 16: Shard Distribution Coverage

*For any* set of tile coordinates `{(z, x, y)}` of size ≥ 4 that are uniformly distributed across `(x + y) mod 4` values, each of the 4 Google Maps tile subdomains (mt0–mt3) shall be selected by `shardTemplate` at least once.

**Validates: Requirements 5.3**

---

## File Change Summary

| File | Change Type | Summary |
|---|---|---|
| `src/core/basemap/tileCache.ts` | Modify | Add `fetchWithTimeout`, `TileRetryQueue`, `clearSourceKey`, accept `TileProtocolHandlerOptions` |
| `src/core/basemap/BasemapRuntime.ts` | Modify | Fix `setPreset` (no reload, AbortController, queue pre-interactive), add recovery state machine, recovery log |
| `src/core/basemap/tilePrefetch.ts` | Modify | Change `PREFETCH_MAX_ZOOM` default from 8 to 12 |
| `src/core/basemap/tileServiceWorker.ts` | New | SW registration with graceful degradation |
| `src/core/basemap/tilePlaceholder.ts` | New | Transparent PNG bytes and `Response` factory |
| `public/basemap-sw.js` | New | SW script: cache-first, LRU eviction, offline placeholder |

---

## Testing Strategy

### Unit / Property Tests (Vitest)

- `tileCache.test.ts` — retry queue logic, timeout behavior, stale-key cleanup, shard distribution
- `tilePrefetch.test.ts` — `enumerateTiles` zoom bound, limit truncation, shard coverage
- `BasemapRuntime.test.ts` — preset switch sequence (no reload), lifecycle transitions, recovery exhaustion, synchronous listener notification
- `basemap-sw.test.ts` — SW cache round-trip, LRU eviction, offline placeholder (using `@vitest/web-worker` or a SW unit-test harness)

Property tests use Vitest's `test.each` with randomly-generated inputs seeded via a fast-check adapter, or hand-rolled generators for tile coordinates. Minimum 100 iterations per property per the PBT guidelines.

### Integration Tests

- Smoke: SW registers successfully in a browser context (`registerTileServiceWorker` smoke test)
- Example: `setPreset` while map is not interactive → change applied on next render event
- Example: `setPreset` transitions `degraded` → `interactive`
- Example: Default timeout of 10 000 ms when `tileRequestTimeoutMs` is absent
