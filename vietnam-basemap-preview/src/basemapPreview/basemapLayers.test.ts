import { describe, expect, it } from 'vitest';
import {
    BASEMAP_LAYER_GROUPS,
    GOOGLE_BASEMAP_LAYER_CAPABILITIES,
    classifyBasemapLayer,
    detectBasemapLayerCapabilities,
    getAvailableBasemapLayerGroups,
} from './basemapLayers';

describe('basemap layer capabilities', () => {
    it('keeps the eight groups in the fixed UI order', () => {
        expect(BASEMAP_LAYER_GROUPS.map(group => group.id)).toEqual([
            'landcover',
            'water',
            'boundaries',
            'roads',
            'labels',
            'pois',
            'buildings',
            'terrain',
        ]);
        expect(BASEMAP_LAYER_GROUPS.every(group => group.defaultVisible)).toBe(true);
    });

    it('maps standard source layers to independent groups', () => {
        const capabilities = detectBasemapLayerCapabilities([
            { id: 'landcover', type: 'fill', 'source-layer': 'landcover' },
            { id: 'landuse', type: 'fill', 'source-layer': 'landuse' },
            { id: 'water', type: 'fill', 'source-layer': 'water' },
            { id: 'boundary', type: 'line', 'source-layer': 'boundary' },
            { id: 'road-major', type: 'line', 'source-layer': 'transportation' },
            { id: 'place-label', type: 'symbol', 'source-layer': 'place' },
            { id: 'poi-label', type: 'symbol', 'source-layer': 'poi' },
            { id: 'building', type: 'fill', 'source-layer': 'building' },
            { id: 'contour-line', type: 'line', 'source-layer': 'contour' },
        ]);

        expect(capabilities.availableGroups).toEqual(BASEMAP_LAYER_GROUPS.map(group => group.id));
        expect(capabilities.groupLayerIds.landcover).toEqual(['landcover', 'landuse']);
        expect(capabilities.groupLayerIds.pois).toEqual(['poi-label']);
    });

    it('hides groups with no matching layers and preserves unknown layers', () => {
        const capabilities = detectBasemapLayerCapabilities([
            { id: 'background', type: 'background' },
            { id: 'custom-overlay', type: 'line', 'source-layer': 'custom' },
            { id: 'road-minor', type: 'line', 'source-layer': 'transportation' },
        ]);

        expect(capabilities.availableGroups).toEqual(['roads']);
        expect(capabilities.unmappedLayerIds).toEqual(['background', 'custom-overlay']);
        expect(capabilities.groupLayerIds.roads).toEqual(['road-minor']);
    });

    it('classifies standard IDs when a style omits source-layer', () => {
        expect(classifyBasemapLayer({ id: 'waterway-line', type: 'line' })).toBe('water');
        expect(classifyBasemapLayer({ id: 'poi-hospital', type: 'symbol' })).toBe('pois');
        expect(classifyBasemapLayer({ id: 'custom-overlay', type: 'line' })).toBeNull();
    });

    it('exposes only precisely controllable Google groups in fixed UI order', () => {
        expect(getAvailableBasemapLayerGroups(GOOGLE_BASEMAP_LAYER_CAPABILITIES).map(group => group.id))
            .toEqual(['roads', 'labels', 'pois']);
        expect(getAvailableBasemapLayerGroups(null)).toEqual([]);
    });
});
