import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStyledBasemapTiles } from './style';
import {
    BASEMAP_TILE_PROTOCOL,
    deriveTileSourceKey,
    isTileCacheAvailable,
    resetBasemapTileCacheRegistry,
    shardTemplate,
    toCachedTileUrls,
} from './tileCache';
import { enumerateTiles, prefetchBasemapTiles, VIETNAM_BOUNDS } from './tilePrefetch';
import { safeInvoke } from '@IMPLEMENT/lib/tauri';

vi.mock('maplibre-gl', () => ({ default: { addProtocol: vi.fn() } }));
vi.mock('@IMPLEMENT/lib/tauri', () => ({
    safeInvoke: vi.fn(),
}));

const TEMPLATES = [
    'https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
];

/** Pretend we are inside the desktop shell, where Rust is reachable. */
function withDesktopShell(run: () => void) {
    const host = window as unknown as Record<string, unknown>;
    host.__TAURI_INTERNALS__ = { invoke: vi.fn() };
    try {
        run();
    } finally {
        delete host.__TAURI_INTERNALS__;
    }
}

describe('tile cache transport', () => {
    afterEach(() => {
        resetBasemapTileCacheRegistry();
        vi.restoreAllMocks();
    });

    it('passes upstream urls through untouched when there is no cache to use', () => {
        expect(isTileCacheAvailable()).toBe(false);
        expect(toCachedTileUrls('street', TEMPLATES)).toEqual(TEMPLATES);
    });

    it('replaces upstream urls with a single protocol url inside the shell', () => {
        withDesktopShell(() => {
            const urls = toCachedTileUrls('street', TEMPLATES);
            expect(urls).toHaveLength(1);
            expect(urls[0]).toMatch(
                new RegExp(`^${BASEMAP_TILE_PROTOCOL}://street-[a-z0-9]+/\\{z\\}/\\{x\\}/\\{y\\}$`)
            );
        });
    });

    it('partitions the cache by styling, not just by preset name', () => {
        const plain = deriveTileSourceKey('street', TEMPLATES);
        const restyled = deriveTileSourceKey(
            'street',
            TEMPLATES.map(template => `${template}&apistyle=s.t%3A8%7Cp.v%3Aoff`)
        );
        expect(plain).not.toEqual(restyled);
    });

    it('derives a stable key for identical templates', () => {
        expect(deriveTileSourceKey('street', TEMPLATES)).toEqual(deriveTileSourceKey('street', TEMPLATES));
    });

    it('substitutes coordinates and spreads load across subdomains', () => {
        expect(shardTemplate(TEMPLATES, 5, 2, 3)).toBe(
            'https://mt1.google.com/vt/lyrs=m&x=2&y=3&z=5'
        );
        expect(shardTemplate(TEMPLATES, 5, 2, 2)).toBe(
            'https://mt0.google.com/vt/lyrs=m&x=2&y=2&z=5'
        );
    });
});

describe('tile enumeration', () => {
    it('places northern tiles above southern ones', () => {
        // Web Mercator inverts the y axis: higher latitude means lower tile y.
        // Getting this backwards would silently prefetch the wrong latitudes.
        const tiles = enumerateTiles(VIETNAM_BOUNDS, 6, 6);
        const north = enumerateTiles([[105, 23], [105.1, 23.1]], 6, 6)[0];
        const south = enumerateTiles([[105, 9], [105.1, 9.1]], 6, 6)[0];

        expect(north.y).toBeLessThan(south.y);
        expect(tiles.length).toBeGreaterThan(0);
    });

    it('keeps every tile inside the pyramid for the zoom level', () => {
        for (let zoom = 0; zoom <= 8; zoom += 1) {
            const span = Math.pow(2, zoom);
            for (const tile of enumerateTiles(VIETNAM_BOUNDS, zoom, zoom)) {
                expect(tile.x).toBeGreaterThanOrEqual(0);
                expect(tile.y).toBeGreaterThanOrEqual(0);
                expect(tile.x).toBeLessThan(span);
                expect(tile.y).toBeLessThan(span);
            }
        }
    });

    it('covers Vietnam rather than an arbitrary corner of the world', () => {
        // z4 tile containing Hanoi (105.83E, 21.03N).
        const [hanoi] = enumerateTiles([[105.8, 21.0], [105.9, 21.1]], 4, 4);
        expect(hanoi).toEqual({ z: 4, x: 12, y: 7 });
    });

    it('honours the tile limit so a bad bounds cannot queue unbounded work', () => {
        expect(enumerateTiles(VIETNAM_BOUNDS, 0, 12, 50)).toHaveLength(50);
    });

    it('emits a single tile at zoom zero', () => {
        expect(enumerateTiles(VIETNAM_BOUNDS, 0, 0)).toEqual([{ z: 0, x: 0, y: 0 }]);
    });
});

describe('prefetch', () => {
    beforeEach(() => {
        resetBasemapTileCacheRegistry();
    });

    it('does nothing outside the desktop shell', async () => {
        await expect(prefetchBasemapTiles({ presetId: 'street' })).resolves.toBeNull();
    });

    it('requests the same cache partition the live map reads', async () => {
        const host = window as unknown as Record<string, unknown>;
        host.__TAURI_INTERNALS__ = {};
        try {
            // Derive the key the way the runtime does — from the styled templates
            // for this preset, not from hand-written fixtures.
            const liveKey = toCachedTileUrls('street', getStyledBasemapTiles('street', {}))[0].split('/')[2];
            const invoke = vi.mocked(safeInvoke).mockResolvedValue({ requested: 1, cached: 0, fetched: 1, failed: 0 });

            await prefetchBasemapTiles({ presetId: 'street', minZoom: 0, maxZoom: 0 });

            expect(invoke).toHaveBeenCalledOnce();
            const [command, payload] = invoke.mock.calls[0] as [
                string,
                { requests: Array<{ sourceKey: string; z: number; x: number; y: number; url: string }> },
            ];
            expect(command).toBe('prefetch_basemap_tiles');
            // The whole point of the warm-up is that the map later finds these
            // rows, which only happens if both sides derive the same key.
            expect(payload.requests[0].sourceKey).toBe(liveKey);
            // And the url must be fully resolved — Rust rejects leftover braces.
            expect(payload.requests[0].url).not.toMatch(/\{[zxy]\}/);
        } finally {
            delete host.__TAURI_INTERNALS__;
        }
    });
});
