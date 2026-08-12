import { describe, expect, it } from 'vitest';
import { normalizeExtentPayload } from './extentPayload';

describe('normalizeExtentPayload', () => {
    it('normalizes the same object shape for external sources', () => {
        const payload = normalizeExtentPayload({
            objectId: 'road-1',
            format: 'geojson',
            geometry: { type: 'LineString', coordinates: [[105, 10], [106, 11]] },
        }, 'http');
        expect(payload).toMatchObject({
            objectId: 'road-1',
            source: 'http',
            extent: { west: 105, south: 10, east: 106, north: 11 },
        });
        expect(payload.receivedAt).toEqual(expect.any(Number));
    });

    it('accepts a GeoJSON feature as the object payload', () => {
        expect(normalizeExtentPayload({
            id: 'point-1',
            data: { type: 'Feature', geometry: { type: 'Point', coordinates: [108, 16] } },
        }, 'file').extent).toEqual({ west: 108, south: 16, east: 108, north: 16 });
    });

    it('rejects invalid object payloads', () => {
        expect(() => normalizeExtentPayload({ geometry: [105, 10] })).toThrow(/objectId/);
        expect(() => normalizeExtentPayload({ objectId: 'bad', geometry: null })).toThrow(/geometry/);
    });
});
