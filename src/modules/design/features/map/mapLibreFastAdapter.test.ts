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
            displaySize: 10,
            labelIndex: '1',
            iconImageId: '',
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

    it('adds display properties for camera point icons', () => {
        const { collection } = buildMapLibreFeatureCollection({
            features: [pointFeature('camera-1', [105.8, 21.02], {
                group_id: 'camera-group',
                metadata: JSON.stringify({ icon: 'ptz', gis: { color: '#2563eb', size: 32, rotation: 45 } }),
            })],
            featureGroups: { 'camera-group': { type: 'CAMERA', name: 'Camera' } },
            featureNumberMap: { 'camera-1': 12 },
            zoom: 20,
        });

        expect(collection.features[0].properties).toEqual(expect.objectContaining({
            iconKey: 'ptz',
            isCamera: true,
            isIntersection: false,
            color: '#2563eb',
            rotation: 45,
            displaySize: 48,
            labelIndex: '12',
        }));
        expect(collection.features[0].properties.iconImageId).toContain('design-point-ptz');
    });

    it('uses native MapLibre labels for ordinary points without a custom icon', () => {
        const { collection } = buildMapLibreFeatureCollection({
            features: [pointFeature('ordinary-point', [105.8, 21.02], {
                metadata: JSON.stringify({ icon: 'point_circle', color: '#f59e0b', size: 14 }),
            })],
            featureNumberMap: { 'ordinary-point': 20 },
            zoom: 20,
        });

        expect(collection.features[0].properties).toEqual(expect.objectContaining({
            iconKey: 'point_circle',
            iconImageId: '',
            labelIndex: '20',
        }));
    });

    it('adds display properties for intersection point icons', () => {
        const { collection } = buildMapLibreFeatureCollection({
            features: [pointFeature('intersection-1', [105.8, 21.02], {
                metadata: JSON.stringify({ icon: 'intersection', gis: { color: '#8b5cf6', size: 30 } }),
            })],
            featureNumberMap: { 'intersection-1': 'N1' },
            zoom: 20,
        });

        expect(collection.features[0].properties).toEqual(expect.objectContaining({
            iconKey: 'intersection',
            isCamera: false,
            isIntersection: true,
            displaySize: 45,
            labelIndex: 'N1',
        }));
    });

    it('keeps selected point display properties', () => {
        const { collection } = buildMapLibreFeatureCollection({
            features: [pointFeature('selected-camera', [105.8, 21.02], {
                metadata: JSON.stringify({ icon: 'cctv', size: 24 }),
            })],
            selectedFeatureId: 'selected-camera',
            featureNumberMap: { 'selected-camera': 3 },
            zoom: 20,
        });

        expect(collection.features[0].properties).toEqual(expect.objectContaining({
            id: 'selected-camera',
            selected: true,
            iconKey: 'cctv',
            isCamera: true,
            displaySize: 36,
            labelIndex: '3',
        }));
    });

    it('keeps line selection and hit-test properties for MapLibre layers', () => {
        const lineFeature: FeatureState = {
            id: 'line-1',
            layer_id: 'layer-1',
            group_id: 'group-1',
            name: 'Line 1',
            geom_type: 'LineString',
            coordinates: [[105.8, 21.02], [105.81, 21.03]],
            properties: {},
            metadata: JSON.stringify({ color: '#06b6d4', size: 4, gis: { dashArray: '8, 4' } }),
        };

        const { collection } = buildMapLibreFeatureCollection({
            features: [lineFeature],
            selectedFeatureId: 'line-1',
            zoom: 20,
        });

        expect(collection.features[0].geometry).toEqual({
            type: 'LineString',
            coordinates: [[105.8, 21.02], [105.81, 21.03]],
        });
        expect(collection.features[0].properties).toEqual(expect.objectContaining({
            id: 'line-1',
            groupId: 'group-1',
            layerId: 'layer-1',
            geomType: 'line',
            selected: true,
            size: 12,
            dashArray: [8, 4],
        }));
    });
});
