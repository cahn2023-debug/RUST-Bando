import { describe, expect, it } from 'vitest';
import { normalizeExtentPayload } from './extentPayload';
import { createGoogleSourceAdapter } from './googleSource';
import { DEFAULT_PREVIEW_USER_CONFIG, normalizePreviewUserConfig } from './previewBridge';
import { PREVIEW_SOURCE_OPTIONS } from './sourceSelector';
import { createPublicStreetViewUrl, parseStreetViewSyncPayload } from './streetView';

describe('standalone preview integration acceptance', () => {
    it('exposes all requested layers and keeps Google sources attribution-only', async () => {
        expect(PREVIEW_SOURCE_OPTIONS.map(option => option.mode)).toEqual([
            'google-street', 'google-hybrid', 'local-package',
        ]);
        const street = createGoogleSourceAdapter('google-street');
        const hybrid = createGoogleSourceAdapter('google-hybrid');
        expect(street.metadata.external).toBe(true);
        expect(hybrid.metadata.external).toBe(true);
        expect((await street.styleDocument('engineering')).layers).toHaveLength(1);
        expect((await hybrid.styleDocument('engineering')).layers).toHaveLength(1);
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
