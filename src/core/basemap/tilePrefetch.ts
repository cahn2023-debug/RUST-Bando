import { getStyledBasemapTiles } from './style';
import { deriveTileSourceKey, isTileCacheAvailable, shardTemplate } from './tileCache';
import type { BasemapPreferences, BasemapPresetId, GeographicBounds } from './types';

/**
 * Launch-time basemap warm-up.
 *
 * Requirement: the map must already hold data by the time a project opens. The
 * map itself mounts at launch and fetches whatever the current viewport needs,
 * but that only covers one viewport. This seeds a low-zoom pyramid over Vietnam
 * so that panning anywhere in the country — or opening a project in a province
 * the user has never visited — draws immediately, and keeps drawing offline.
 *
 * Zoom levels are chosen for cost, not completeness: z0–z8 over Vietnam is a few
 * hundred tiles, which is a couple of seconds of background fetching. Going one
 * level deeper quadruples that for little perceived gain, since by z9 the user
 * has usually already navigated somewhere specific and the live map has cached
 * that area anyway.
 */

/** Mainland Vietnam plus the offshore island groups, [[west, south], [east, north]]. */
export const VIETNAM_BOUNDS: GeographicBounds = [
    [102.14, 8.18],
    [109.46, 23.39],
];

const PREFETCH_MIN_ZOOM = 0;
const PREFETCH_MAX_ZOOM = 12;
/** Hard ceiling so a bounds/zoom change can never queue an unbounded job. */
const MAX_PREFETCH_TILES = 1200;
/** Let the first frame paint before competing for bandwidth. */
const PREFETCH_DELAY_MS = 1500;

export interface PrefetchReport {
    requested: number;
    cached: number;
    fetched: number;
    failed: number;
}

interface TileCoordinate {
    z: number;
    x: number;
    y: number;
}

function longitudeToTileX(longitude: number, zoom: number): number {
    return Math.floor(((longitude + 180) / 360) * Math.pow(2, zoom));
}

function latitudeToTileY(latitude: number, zoom: number): number {
    const radians = (latitude * Math.PI) / 180;
    const mercator =
        Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI;
    return Math.floor(((1 - mercator) / 2) * Math.pow(2, zoom));
}

/**
 * Enumerate the tiles covering `bounds` between the two zoom levels.
 *
 * Exported for testing: the y-axis inversion in Web Mercator (tile y grows
 * southward while latitude grows northward) is exactly the kind of thing that
 * silently prefetches the wrong hemisphere.
 */
export function enumerateTiles(
    bounds: GeographicBounds,
    minZoom = PREFETCH_MIN_ZOOM,
    maxZoom = PREFETCH_MAX_ZOOM,
    limit = MAX_PREFETCH_TILES
): TileCoordinate[] {
    const [[west, south], [east, north]] = bounds;
    const tiles: TileCoordinate[] = [];

    for (let z = minZoom; z <= maxZoom; z += 1) {
        const span = Math.pow(2, z);
        const clamp = (value: number) => Math.min(Math.max(value, 0), span - 1);

        const minX = clamp(longitudeToTileX(west, z));
        const maxX = clamp(longitudeToTileX(east, z));
        // North is the smaller tile y.
        const minY = clamp(latitudeToTileY(north, z));
        const maxY = clamp(latitudeToTileY(south, z));

        for (let x = minX; x <= maxX; x += 1) {
            for (let y = minY; y <= maxY; y += 1) {
                if (tiles.length >= limit) return tiles;
                tiles.push({ z, x, y });
            }
        }
    }
    return tiles;
}

/**
 * Ask Rust to warm the tile cache over `bounds`.
 *
 * Resolves to `null` when there is no cache to warm (browser, tests) so callers
 * can fire-and-forget without branching on the environment.
 */
export async function prefetchBasemapTiles(options: {
    presetId: BasemapPresetId;
    preferences?: Partial<BasemapPreferences>;
    bounds?: GeographicBounds;
    minZoom?: number;
    maxZoom?: number;
    signal?: AbortSignal;
}): Promise<PrefetchReport | null> {
    if (!isTileCacheAvailable()) return null;

    const {
        presetId,
        preferences = {},
        bounds = VIETNAM_BOUNDS,
        minZoom = PREFETCH_MIN_ZOOM,
        maxZoom = PREFETCH_MAX_ZOOM,
        signal,
    } = options;

    const templates = getStyledBasemapTiles(presetId, preferences);
    if (templates.length === 0) return null;

    const coordinates = enumerateTiles(bounds, minZoom, maxZoom);
    // Keyed by styling, not just preset id: restyled tiles are different images.
    const sourceKey = deriveTileSourceKey(presetId, templates);

    const requests = coordinates.map(({ z, x, y }) => ({
        sourceKey,
        z,
        x,
        y,
        url: shardTemplate(templates, z, x, y),
    }));

    if (signal?.aborted) return null;

    try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<PrefetchReport>('prefetch_basemap_tiles', { requests });
    } catch (error) {
        // Warm-up is an optimisation; failing it must not affect startup.
        console.warn('[Basemap] prefetch failed', error);
        return null;
    }
}

/**
 * Schedule the warm-up after the app has settled.
 *
 * Returns a cancel function so a caller unmounting mid-startup does not leave a
 * timer holding a stale preset.
 */
export function scheduleBasemapPrefetch(options: {
    presetId: BasemapPresetId;
    preferences?: Partial<BasemapPreferences>;
    delayMs?: number;
}): () => void {
    if (!isTileCacheAvailable()) return () => {};

    const controller = new AbortController();
    const timer = setTimeout(() => {
        void prefetchBasemapTiles({ ...options, signal: controller.signal });
    }, options.delayMs ?? PREFETCH_DELAY_MS);

    return () => {
        clearTimeout(timer);
        controller.abort();
    };
}
