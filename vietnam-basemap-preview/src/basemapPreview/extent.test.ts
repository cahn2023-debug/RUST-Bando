import { describe, expect, it } from 'vitest';
import { getPreviewExtent } from './extent';

describe('getPreviewExtent', () => {
    it('calculates an extent for a GeoJSON feature collection', () => {
        expect(getPreviewExtent({
            type: 'FeatureCollection',
            features: [
                { type: 'Feature', geometry: { type: 'Point', coordinates: [105, 10] } },
                { type: 'Feature', geometry: { type: 'LineString', coordinates: [[106, 11], [107, 12]] } },
            ],
        })).toEqual({ west: 105, south: 10, east: 107, north: 12 });
    });

    it('accepts a coordinate tree used by MapLibre geometries', () => {
        expect(getPreviewExtent([[[104, 9], [108, 14]]])).toEqual({
            west: 104, south: 9, east: 108, north: 14,
        });
    });

    it('rejects missing and non-finite coordinates', () => {
        expect(getPreviewExtent(null)).toBeNull();
        expect(getPreviewExtent({ type: 'Point', coordinates: [Number.NaN, 10] })).toBeNull();
        expect(getPreviewExtent({ type: 'Feature', geometry: null })).toBeNull();
    });
});
