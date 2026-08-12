import { describe, expect, it } from 'vitest';
import { normalizeExtentPayload } from './extentPayload';
import { createGoogleSourceAdapter } from './googleSource';
import { createLocalPackageAdapter } from './localPackage';
import { GOOGLE_BASEMAP_LAYER_CAPABILITIES, detectBasemapLayerCapabilities, getAvailableBasemapLayerGroups } from './basemapLayers';
import { DEFAULT_PREVIEW_USER_CONFIG, normalizePreviewUserConfig } from './previewBridge';
import { PREVIEW_SOURCE_OPTIONS } from './sourceSelector';
import { createPublicStreetViewUrl, parseStreetViewSyncPayload } from './streetView';
import type { PreviewFileReader } from './types';

function packageReader(files: Record<string, string>): PreviewFileReader {
    return {
        read: async path => {
            const content = files[path];
            if (content === undefined) throw new Error(`missing ${path}`);
            return new TextEncoder().encode(content);
        },
    };
}

describe('standalone preview integration acceptance', () => {
    it('exposes all requested sources and keeps Google preview-only with error-only policy', async () => {
        expect(PREVIEW_SOURCE_OPTIONS.map(option => option.mode)).toEqual([
            'google-street', 'google-hybrid', 'local-package',
        ]);
        const street = createGoogleSourceAdapter('google-street');
        const hybrid = createGoogleSourceAdapter('google-hybrid');
        expect(street.metadata.external).toBe(true);
        expect(hybrid.metadata.external).toBe(true);
        expect(street.metadata.attribution).toContain('external');
        expect(hybrid.metadata.attribution).toContain('external');
        expect((await street.styleDocument('engineering')).layers).toHaveLength(1);
        expect((await hybrid.styleDocument('engineering')).layers).toHaveLength(2);
        street.recordTileError(new Error('offline'));
        expect(street.getTileError()?.message).toContain('offline');
        expect(street.getTileError()?.message).not.toContain('fallback');
        expect(getAvailableBasemapLayerGroups(GOOGLE_BASEMAP_LAYER_CAPABILITIES).map(group => group.id))
            .toEqual(['roads', 'labels', 'pois']);
    });

    it('covers Local capability discovery and preserves unmapped style layers', async () => {
        const manifest = {
            id: 'vn-basemap', name: 'Vietnam Basemap', version: '1.0.0', contractVersion: '1', schemaVersion: '1',
            defaultStyle: 'engineering', attribution: '© OpenStreetMap contributors',
            styles: [{ id: 'engineering', label: 'Engineering', path: 'styles/engineering.json' }],
            assets: { tileArchive: 'tiles/vietnam.pmtiles', fonts: [], sprites: [] },
        };
        const style = {
            version: 8,
            sources: { vn: { type: 'vector', url: '{basemap-tiles}' } },
            layers: [
                { id: 'water-fill', type: 'fill', source: 'vn', 'source-layer': 'water' },
                { id: 'road-primary', type: 'line', source: 'vn', 'source-layer': 'transportation' },
                { id: 'custom-overlay', type: 'line', source: 'vn', 'source-layer': 'custom' },
            ],
        };
        const adapter = await createLocalPackageAdapter(packageReader({
            'manifest.json': JSON.stringify(manifest),
            'styles/engineering.json': JSON.stringify(style),
            'tiles/vietnam.pmtiles': 'archive',
        }));
        const resolved = await adapter.styleDocument('engineering');
        const capabilities = detectBasemapLayerCapabilities(resolved.layers as Array<{ id: string; type: string; 'source-layer'?: string }>);

        expect(capabilities.availableGroups).toEqual(['water', 'roads']);
        expect(capabilities.unmappedLayerIds).toContain('custom-overlay');
        expect(JSON.stringify(resolved)).toContain('pmtiles://package');
    });

    it('normalizes identical object extents regardless of HTTP or IPC source', () => {
        const object = {
            objectId: 'parcel-42',
            geometry: { type: 'Polygon', coordinates: [[[105, 10], [106, 10], [106, 11], [105, 10]]] },
        };
        const fromHttp = normalizeExtentPayload(object, 'http');
        const fromIpc = normalizeExtentPayload(object, 'ipc');
        expect(fromHttp.extent).toEqual(fromIpc.extent);
        expect(fromHttp.objectId).toBe(fromIpc.objectId);
    });

    it('keeps auto-zoom enabled by default while restoring user settings', () => {
        expect(DEFAULT_PREVIEW_USER_CONFIG.autoZoom).toBe(true);
        expect(normalizePreviewUserConfig({ layer: 'google-hybrid', httpPort: 39001, autoZoom: false })).toMatchObject({
            layer: 'google-hybrid', httpPort: 39001, autoZoom: false,
        });
    });

    it('validates Street View lifecycle and public fallback without production commands', () => {
        expect(parseStreetViewSyncPayload({
            status: 'state', viewpoint: { point: [105, 10], heading: 90, pitch: 2, fov: 75 },
        })).toMatchObject({ status: 'state', viewpoint: { point: [105, 10], heading: 90, fov: 75 } });
        expect(parseStreetViewSyncPayload({ status: 'state', viewpoint: { point: ['bad', 10] } })).toBeNull();
        expect(parseStreetViewSyncPayload({ status: 'closed' })).toEqual({ status: 'closed' });
        expect(createPublicStreetViewUrl({ point: [105, 10], heading: 90, pitch: 0, fov: 90 })).toContain('maps.google.com');
    });
});
