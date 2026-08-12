import { describe, expect, it } from 'vitest';
import { createGoogleSourceAdapter, GOOGLE_HYBRID_TILE_TEMPLATE, GOOGLE_RASTER_TILE_TEMPLATE } from './googleSource';

describe('Google preview source', () => {
    it('uses the locked raster template and external attribution', async () => {
        const adapter = createGoogleSourceAdapter();
        const style = await adapter.styleDocument('engineering');
        const source = (style.sources as Record<string, { tiles?: string[] }>)['google-raster'];
        expect(source.tiles).toEqual([GOOGLE_RASTER_TILE_TEMPLATE]);
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

    it('uses the hybrid raster template when the hybrid layer is selected', async () => {
        const adapter = createGoogleSourceAdapter('google-hybrid');
        const style = await adapter.styleDocument('engineering');
        const source = (style.sources as Record<string, { tiles?: string[] }>)['google-raster'];
        expect(source.tiles).toEqual([GOOGLE_HYBRID_TILE_TEMPLATE]);
        expect(adapter.metadata.name).toContain('Hybrid');
    });
});
