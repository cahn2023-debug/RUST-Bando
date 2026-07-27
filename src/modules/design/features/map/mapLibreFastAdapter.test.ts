import { describe, expect, it } from 'vitest';
import type { FeatureState } from '@CONTRACT/types';
import { buildMapLibreFeatureCollection, getMapLibreLodPolicy } from './mapLibreFastAdapter';

const pointFeature = (
    id: string,
    coordinates: [number, number] = [105.8, 21.02],
    overrides: Partial<FeatureState> = {}
): FeatureState => ({
    id,
    layer_id: 'layer-1',
    group_id: 'group-1',
    name: id,
    geom_type: 'Point',
    coordinates,
    properties: {},
    metadata: JSON.stringify({ color: '#ef4444', size: 10 }),
    ...overrides,
});

describe('mapLibreFastAdapter', () => {
    it('uses summary LOD for low zoom or very large viewports', () => {
        expect(getMapLibreLodPolicy({ zoom: 13, featureCount: 100 }).level).toBe('summary');
        expect(getMapLibreLodPolicy({ zoom: 18, featureCount: 9000 }).level).toBe('summary');
    });

    it('builds render GeoJSON with flattened style properties', () => {
        const { collection, lodPolicy } = buildMapLibreFeatureCollection({
            features: [pointFeature('p1')],
            zoom: 20,
        });

        expect(lodPolicy.level).toBe('full');
        expect(collection.features).toHaveLength(1);
        expect(collection.features[0].geometry).toEqual({ type: 'Point', coordinates: [105.8, 21.02] });
        expect(collection.features[0].properties).toEqual(expect.objectContaining({
            id: 'p1',
            color: '#ef4444',
            size: 10,
            selected: false,
        }));
    });

    it('preserves group theme point sizes up to the modal maximum', () => {
        const { collection } = buildMapLibreFeatureCollection({
            features: [pointFeature('p1', [105.8, 21.02], {
                metadata: JSON.stringify({ color: '#ef4444', size: 91 }),
            })],
            zoom: 20,
        });

        expect(collection.features[0].properties.size).toBe(91);
    });

    it('prioritizes GIS size over metadata and properties size', () => {
        const { collection } = buildMapLibreFeatureCollection({
            features: [pointFeature('p1', [105.8, 21.02], {
                properties: { size: 24 },
                metadata: JSON.stringify({ size: 32, gis: { size: 76 } }),
            })],
            zoom: 20,
        });

        expect(collection.features[0].properties.size).toBe(76);
    });

    it('clamps oversized point sizes to the modal maximum', () => {
        const { collection } = buildMapLibreFeatureCollection({
            features: [pointFeature('p1', [105.8, 21.02], {
                metadata: JSON.stringify({ size: 140 }),
            })],
            zoom: 20,
        });

        expect(collection.features[0].properties.size).toBe(100);
    });

    it('keeps selected point size while enforcing the selected minimum', () => {
        const { collection } = buildMapLibreFeatureCollection({
            features: [
                pointFeature('large-selected', [105.8, 21.02], {
                    metadata: JSON.stringify({ size: 91 }),
                }),
                pointFeature('small-selected', [105.81, 21.03], {
                    metadata: JSON.stringify({ size: 6 }),
                }),
            ],
            selectedFeatureId: 'large-selected',
            zoom: 20,
        });

        expect(collection.features[0].properties.size).toBe(91);

        const { collection: smallSelectedCollection } = buildMapLibreFeatureCollection({
            features: [pointFeature('small-selected', [105.81, 21.03], {
                metadata: JSON.stringify({ size: 6 }),
            })],
            selectedFeatureId: 'small-selected',
            zoom: 20,
        });

        expect(smallSelectedCollection.features[0].properties.size).toBe(12);
    });

    it('keeps the selected feature even when LOD caps the rest', () => {
        const manyFeatures = Array.from({ length: 2500 }, (_, index) => pointFeature(`p${index}`));
        const { collection, lodPolicy } = buildMapLibreFeatureCollection({
            features: manyFeatures,
            selectedFeatureId: 'p2400',
            zoom: 13,
        });

        expect(lodPolicy.level).toBe('summary');
        expect(collection.features[0].properties.id).toBe('p2400');
        expect(collection.features).toHaveLength(lodPolicy.maxFeatures + 1);
    });

    it('filters hidden features, groups, and layers before rendering', () => {
        const hiddenFeature = pointFeature('hidden-feature');
        const hiddenGroup = { ...pointFeature('hidden-group'), group_id: 'hidden-group-id' };
        const hiddenLayer = { ...pointFeature('hidden-layer'), layer_id: 'hidden-layer-id' };
        const visible = pointFeature('visible');

        const { collection } = buildMapLibreFeatureCollection({
            features: [hiddenFeature, hiddenGroup, hiddenLayer, visible],
            hiddenIds: new Set(['hidden-feature', 'hidden-group-id', 'hidden-layer-id']),
            zoom: 20,
        });

        expect(collection.features.map(feature => feature.properties.id)).toEqual(['visible']);
    });
});
