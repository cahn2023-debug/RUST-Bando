import { describe, expect, it } from 'vitest';
import { buildGoogleStyledTileTemplate, buildGoogleTileProxyTemplate, createGoogleSourceAdapter, getGoogleTileProxyBaseUrl, GOOGLE_HYBRID_TILE_TEMPLATE, GOOGLE_RASTER_TILE_TEMPLATE } from './googleSource';

describe('Google preview source', () => {
    it('uses the locked raster template and external attribution', async () => {
        const adapter = createGoogleSourceAdapter();
        const style = await adapter.styleDocument('engineering');
        const source = (style.sources as Record<string, { tiles?: string[] }>)['google-raster'];
        expect(source.tiles).toEqual(['/api/v1/google-tile?lyrs=m&x={x}&y={y}&z={z}']);
        expect(adapter.metadata.external).toBe(true);
        expect(adapter.metadata.attribution).toContain('external');
    });

    it('records tile errors without selecting a fallback source', () => {
        const adapter = createGoogleSourceAdapter();
        adapter.recordTileError(new Error('network unavailable'));
        expect(adapter.getTileError()).toEqual({
            source: 'Google Street (external)',
            message: 'Không tải được Google raster tile: network unavailable',
        });
    });

    it('uses a satellite base plus a transparent information overlay for hybrid', async () => {
        const adapter = createGoogleSourceAdapter('google-hybrid');
        const style = await adapter.styleDocument('engineering');
        const sources = style.sources as Record<string, { tiles?: string[] }>;
        expect(sources['google-hybrid-base'].tiles).toEqual(['/api/v1/google-tile?lyrs=s&x={x}&y={y}&z={z}']);
        expect(sources['google-hybrid-overlay'].tiles).toEqual(['/api/v1/google-tile?lyrs=h&x={x}&y={y}&z={z}']);
        expect(style.layers).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'google-hybrid-base-layer', source: 'google-hybrid-base' }),
            expect.objectContaining({ id: 'google-hybrid-overlay-layer', source: 'google-hybrid-overlay' }),
        ]));
        expect(adapter.metadata.name).toContain('Hybrid');
    });

    it('builds a fixed-host proxy template while preserving the upstream Google template', () => {
        expect(buildGoogleTileProxyTemplate(GOOGLE_HYBRID_TILE_TEMPLATE, 'http://127.0.0.1:38741/api/v1/google-tile'))
            .toBe('http://127.0.0.1:38741/api/v1/google-tile?lyrs=y&x={x}&y={y}&z={z}');
        expect(() => buildGoogleTileProxyTemplate('https://example.invalid/tiles/{z}/{x}/{y}')).toThrow(/Unsupported/);
    });

    it('uses the Vite-relative proxy in a browser and the Tauri localhost proxy in the desktop shell', () => {
        expect(getGoogleTileProxyBaseUrl(38741)).toBe('/api/v1/google-tile');

        const originalWindow = globalThis.window;
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { __TAURI_INTERNALS__: {} },
        });
        try {
            expect(getGoogleTileProxyBaseUrl(41234, false)).toBe('http://127.0.0.1:41234/api/v1/google-tile');
        } finally {
            Object.defineProperty(globalThis, 'window', {
                configurable: true,
                value: originalWindow,
            });
        }
    });

    it('encodes independent Google road, label, and POI visibility rules', () => {
        const allOff = decodeURIComponent(buildGoogleStyledTileTemplate(GOOGLE_RASTER_TILE_TEMPLATE, {
            roads: false,
            labels: false,
            pois: false,
        }));
        expect(allOff).toContain('s.t:3|s.e:g|p.v:off');
        expect(allOff).toContain('s.e:l|p.v:off');
        expect(allOff).toContain('s.t:2|s.e:l|p.v:off');
        expect(allOff).toContain('s.t:2|s.e:l.i|p.v:off');

        const labelsOffOnly = decodeURIComponent(buildGoogleStyledTileTemplate(GOOGLE_RASTER_TILE_TEMPLATE, {
            roads: true,
            labels: false,
            pois: true,
        }));
        expect(labelsOffOnly).toContain('s.e:l|p.v:off');
        expect(labelsOffOnly).toContain('s.t:2|s.e:l|p.v:on');

        const poisOffOnly = decodeURIComponent(buildGoogleStyledTileTemplate(GOOGLE_RASTER_TILE_TEMPLATE, {
            roads: true,
            labels: true,
            pois: false,
        }));
        expect(poisOffOnly).toContain('s.t:2|s.e:l|p.v:off');
        expect(poisOffOnly).toContain('s.t:2|s.e:l.i|p.v:off');
    });
});
