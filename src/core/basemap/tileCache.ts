import maplibregl from 'maplibre-gl';
import { transparentPngBytes } from './tilePlaceholder';

/**
 * Cache-first tile transport.
 *
 * MapLibre cannot be handed tile bytes directly, so tiles are routed through a
 * custom `basemap://` protocol. The handler asks Rust for the tile; Rust serves
 * it from its on-disk cache or fetches and stores it. That is what makes the map
 * survive a restart and keep drawing while offline.
 *
 * # Why a URL registry instead of encoding the upstream URL in the tile URL
 *
 * Upstream tile URLs contain `&`-separated query parameters (including a long
 * `apistyle=` payload). Nesting one URL inside another means two layers of
 * escaping and a parser to match. Instead the upstream templates are registered
 * here under a short key and the tile URL carries only that key plus `z/x/y`.
 *
 * # Degradation
 *
 * Outside the desktop shell (browser dev, tests) there is no Rust to talk to, so
 * `toCachedTileUrls` returns the upstream URLs unchanged and no protocol is
 * involved. If the IPC call fails at runtime the handler fetches the tile
 * directly, so a broken cache means an uncached map rather than a blank one.
 */

export const BASEMAP_TILE_PROTOCOL = 'basemap';

/** Options passed to `registerBasemapTileProtocol`. */
export interface TileProtocolHandlerOptions {
    /** Milliseconds before a tile fetch is aborted. Defaults to 10 000 when 0 or absent. */
    timeoutMs: number;
}

interface RegisteredSource {
    /** Upstream URL templates, still containing `{z}`/`{x}`/`{y}`. */
    templates: string[];
}

/** Describes a tile fetch that failed and is awaiting retry. */
interface RetryEntry {
    url: string;
    sourceKey: string;
    z: number;
    x: number;
    y: number;
    attempts: number;
    lastStatus?: number;
}

/** Structured error logged when all retries for a tile are exhausted. */
interface TileLoadError {
    z: number;
    x: number;
    y: number;
    url: string;
    /** null for network/timeout errors where no HTTP response was received. */
    status: number | null;
    message: string;
    /** ISO 8601 timestamp. */
    timestamp: string;
}

const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_RATE_LIMIT_DELAY_MS = 5000;

const sources = new Map<string, RegisteredSource>();
/** In-memory queue of tiles awaiting retry. Key = `${sourceKey}/${z}/${x}/${y}`. */
const retryQueue = new Map<string, RetryEntry>();
let protocolRegistered = false;
let handlerOptions: TileProtocolHandlerOptions = { timeoutMs: 10_000 };

/** True when the Rust side is reachable, i.e. we are inside the desktop shell. */
export function isTileCacheAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    const host = window as unknown as Record<string, unknown>;
    return Boolean(host.__TAURI_INTERNALS__ || host.__TAURI__);
}

/**
 * FNV-1a. Not for security — just a short, stable fingerprint so that two
 * different tile stylings can never share a cache partition.
 */
function fingerprint(value: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

function sanitize(value: string): string {
    // Lowercased because the key travels as a URL authority, and anything that
    // parses the URL with `new URL()` would lowercase the host for us — better to
    // be canonical from the start than to miss the cache on a capital letter.
    return value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'basemap';
}

/**
 * Name the cache partition for a set of upstream templates.
 *
 * Both the live tile transport and the launch prefetch must derive the same key
 * for the same styling, otherwise the warm-up fills a partition the map never
 * reads. That is why this is one exported function rather than the same
 * arithmetic written twice.
 */
export function deriveTileSourceKey(label: string, upstreamTemplates: string[]): string {
    return `${sanitize(label)}-${fingerprint(upstreamTemplates.join('|'))}`;
}

/**
 * Register upstream templates and return the tile URL MapLibre should use.
 *
 * `label` only exists to make the cache readable when inspecting the database;
 * correctness comes from the fingerprint.
 */
export function toCachedTileUrls(label: string, upstreamTemplates: string[]): string[] {
    if (!isTileCacheAvailable() || upstreamTemplates.length === 0) return upstreamTemplates;

    const key = deriveTileSourceKey(label, upstreamTemplates);
    sources.set(key, { templates: [...upstreamTemplates] });
    registerBasemapTileProtocol();
    return [`${BASEMAP_TILE_PROTOCOL}://${key}/{z}/{x}/{y}`];
}

/**
 * Pick which upstream subdomain serves a tile.
 *
 * Shared with the prefetcher so a warm-up writes the same cache row the live map
 * later reads — the row is keyed by `(sourceKey, z, x, y)`, but sharding by a
 * different rule would still fetch different bytes for no reason.
 */
export function shardTemplate(templates: string[], z: number, x: number, y: number): string {
    return templates[(x + y) % templates.length]
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y));
}

/** Resolve a `basemap://key/z/x/y` URL back to a cache request. */
function parseTileUrl(url: string): { sourceKey: string; z: number; x: number; y: number; upstream: string } | null {
    const withoutScheme = url.slice(`${BASEMAP_TILE_PROTOCOL}://`.length);
    const parts = withoutScheme.split('/');
    if (parts.length < 4) return null;

    const [sourceKey, rawZ, rawX, rawY] = parts;
    const z = Number(rawZ);
    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return null;

    const registered = sources.get(sourceKey);
    if (!registered) return null;

    // Spread requests across the upstream subdomains the same way MapLibre would,
    // so a cold cache still parallelises across connections.
    const upstream = shardTemplate(registered.templates, z, x, y);

    return { sourceKey, z, x, y, upstream };
}

/**
 * Fetch a URL with a hard timeout enforced via `AbortController`.
 * Clears the timer whether the fetch resolves or rejects.
 */
export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 10_000);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/** Pause execution for `ms` milliseconds. */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a failed tile fetch with exponential backoff.
 *
 * - 5xx / network error: backoff 1 s → 2 s → 4 s
 * - 429: fixed 5 000 ms delay
 * - 4xx (except 429): give up immediately (caller should not enqueue)
 * - 3 attempts exhausted: log structured `TileLoadError` and return a transparent PNG placeholder
 */
async function retryTileFetch(entry: RetryEntry): Promise<ArrayBuffer> {
    const { url, sourceKey, z, x, y } = entry;
    const queueKey = `${sourceKey}/${z}/${x}/${y}`;

    while (entry.attempts < RETRY_MAX_ATTEMPTS) {
        // Compute delay for this attempt
        const waitMs = entry.lastStatus === 429
            ? RETRY_RATE_LIMIT_DELAY_MS
            : RETRY_BASE_DELAY_MS * Math.pow(2, entry.attempts - 1);

        await delay(waitMs);

        try {
            const response = await fetchWithTimeout(url, handlerOptions.timeoutMs);

            if (response.ok) {
                retryQueue.delete(queueKey);
                return await response.arrayBuffer();
            }

            entry.attempts += 1;
            entry.lastStatus = response.status;
            retryQueue.set(queueKey, entry);

            // 4xx (except 429) — give up immediately
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                break;
            }
        } catch (_networkError) {
            // Network / timeout error
            entry.attempts += 1;
            entry.lastStatus = undefined;
            retryQueue.set(queueKey, entry);
        }
    }

    // All attempts exhausted — log structured error and serve placeholder
    retryQueue.delete(queueKey);
    const errorEntry: TileLoadError = {
        z,
        x,
        y,
        url,
        status: entry.lastStatus ?? null,
        message: `Tile load failed after ${RETRY_MAX_ATTEMPTS} attempts`,
        timestamp: new Date().toISOString(),
    };
    console.error('[Basemap] TileLoadError', errorEntry);

    return transparentPngBytes().buffer as ArrayBuffer;
}

async function loadThroughCache(url: string): Promise<{ data: ArrayBuffer }> {
    const parsed = parseTileUrl(url);
    if (!parsed) throw new Error(`[Basemap] unrecognised tile url: ${url}`);

    const { sourceKey, z, x, y, upstream } = parsed;
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        const bytes = await invoke<ArrayBuffer | Uint8Array | number[]>('get_basemap_tile', {
            request: { sourceKey, z, x, y, url: upstream },
        });
        return { data: toArrayBuffer(bytes) };
    } catch (error) {
        // A failed cache must never mean a failed map.
        console.warn('[Basemap] tile cache miss, fetching directly', error);

        let response: Response;
        try {
            response = await fetchWithTimeout(upstream, handlerOptions.timeoutMs);
        } catch (_networkError) {
            // Network error or timeout — enqueue for retry
            const queueKey = `${sourceKey}/${z}/${x}/${y}`;
            const existing = retryQueue.get(queueKey);
            const entry: RetryEntry = existing ?? {
                url: upstream,
                sourceKey,
                z,
                x,
                y,
                attempts: 1,
            };
            if (!existing) {
                retryQueue.set(queueKey, entry);
            }
            const data = await retryTileFetch(entry);
            return { data };
        }

        if (response.ok) {
            return { data: await response.arrayBuffer() };
        }

        const status = response.status;

        // 4xx except 429 — log and give up immediately
        if (status >= 400 && status < 500 && status !== 429) {
            const errorEntry: TileLoadError = {
                z,
                x,
                y,
                url: upstream,
                status,
                message: `Tile request failed with status ${status}`,
                timestamp: new Date().toISOString(),
            };
            console.error('[Basemap] TileLoadError', errorEntry);
            return { data: transparentPngBytes().buffer as ArrayBuffer };
        }

        // 5xx or 429 — enqueue for retry
        const queueKey = `${sourceKey}/${z}/${x}/${y}`;
        const existing = retryQueue.get(queueKey);
        const entry: RetryEntry = existing ?? {
            url: upstream,
            sourceKey,
            z,
            x,
            y,
            attempts: 1,
            lastStatus: status,
        };
        if (!existing) {
            entry.lastStatus = status;
            retryQueue.set(queueKey, entry);
        }
        const data = await retryTileFetch(entry);
        return { data };
    }
}

function toArrayBuffer(bytes: ArrayBuffer | Uint8Array | number[]): ArrayBuffer {
    if (bytes instanceof ArrayBuffer) return bytes;
    if (bytes instanceof Uint8Array) {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }
    return new Uint8Array(bytes).buffer;
}

/**
 * Install the protocol handler. Idempotent — MapLibre keeps one handler per
 * scheme globally, and re-registering would replace a live one mid-flight.
 */
export function registerBasemapTileProtocol(options?: TileProtocolHandlerOptions): void {
    if (options) {
        handlerOptions = options;
    }
    if (protocolRegistered) return;

    // Structural access rather than the exported type: `addProtocol` has moved
    // between the namespace and the default export across MapLibre majors, and a
    // missing handler must degrade to direct fetching, not break the build.
    const runtime = maplibregl as unknown as {
        addProtocol?: (scheme: string, handler: (params: { url: string }) => Promise<{ data: ArrayBuffer }>) => void;
    };
    if (typeof runtime.addProtocol !== 'function') return;

    runtime.addProtocol(BASEMAP_TILE_PROTOCOL, params => loadThroughCache(params.url));
    protocolRegistered = true;
}

/**
 * Remove a stale source registry entry when switching presets.
 *
 * Called by `BasemapRuntime.setPreset()` before registering the new source so
 * that tiles from the previous preset cannot be served from a stale entry.
 */
export function clearSourceKey(key: string): void {
    sources.delete(key);
}

/**
 * Remove all retry queue entries for a given source key.
 *
 * Called by `BasemapRuntime.setPreset()` when switching presets so that
 * in-flight retry attempts for the previous preset are discarded.
 */
export function clearRetryQueue(sourceKey: string): void {
    const prefix = `${sourceKey}/`;
    for (const k of retryQueue.keys()) {
        if (k.startsWith(prefix)) {
            retryQueue.delete(k);
        }
    }
}

/** Test seam: forget registered sources so cases cannot leak into each other. */
export function resetBasemapTileCacheRegistry(): void {
    sources.clear();
}
