import { describe, expect, it, vi } from 'vitest';
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

    it('clusters points only below zoom 15', () => {
        expect(getMapLibreLodPolicy({ zoom: 14.9, featureCount: 100 }).clusterPoints).toBe(true);
        expect(getMapLibreLodPolicy({ zoom: 15, featureCount: 100 }).clusterPoints).toBe(false);
        expect(getMapLibreLodPolicy({ zoom: 18, featureCount: 9000 }).clusterPoints).toBe(false);
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

    it('limits report capture rendering to focused route and intersection ids', () => {
        const route: FeatureState = {
            id: 'route-1',
            layer_id: 'layer-1',
            group_id: 'group-1',
            name: 'Route 1',
            geom_type: 'LineString',
            coordinates: [[105.8, 21.02], [105.81, 21.03]],
            properties: {},
            metadata: JSON.stringify({ infrastructure: { type: 'SignalLine' } }),
        };
        const intersection = pointFeature('intersection-1', [105.805, 21.025], {
            metadata: JSON.stringify({ icon: 'intersection' }),
        });
        const unrelatedRoute: FeatureState = {
            ...route,
            id: 'route-2',
            name: 'Route 2',
            coordinates: [[105.9, 21.1], [105.91, 21.11]],
        };
        const routeChild = pointFeature('camera-child', [105.805, 21.025], {
            metadata: JSON.stringify({ icon: 'cctv', parent_feature_id: 'intersection-1' }),
        });

        const { collection } = buildMapLibreFeatureCollection({
            features: [route, intersection, unrelatedRoute, routeChild],
            focusIds: new Set(['route-1', 'intersection-1']),
            hiddenIds: new Set(['route-2']),
            zoom: 20,
        });

        expect(collection.features.map(feature => feature.properties.id)).toEqual(['route-1', 'intersection-1']);
    });

    it('hides intersection children below zoom 17 while keeping the parent intersection', () => {
        const parent = pointFeature('intersection-parent', [105.8, 21.02], {
            group_id: 'junction-group',
            metadata: JSON.stringify({ icon: 'intersection' }),
        });
        const child = pointFeature('junction-camera', [105.81, 21.03], {
            group_id: 'junction-group',
            metadata: JSON.stringify({ icon: 'cctv', parent_feature_id: 'intersection-parent' }),
        });

        const lowZoom = buildMapLibreFeatureCollection({
            features: [parent, child],
            featureGroups: { 'junction-group': { type: 'INTERSECTION', name: 'Nút giao' } },
            zoom: 16,
        });
        const highZoom = buildMapLibreFeatureCollection({
            features: [parent, child],
            featureGroups: { 'junction-group': { type: 'INTERSECTION', name: 'Nút giao' } },
            zoom: 17,
        });

        expect(lowZoom.collection.features.map(feature => feature.properties.id)).toEqual(['intersection-parent']);
        expect(highZoom.collection.features.map(feature => feature.properties.id)).toEqual(['intersection-parent', 'junction-camera']);
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

    it('renders legacy object coordinate shapes for points, lines, and polygons', () => {
        const legacyPointFeature: FeatureState = {
            id: 'legacy-point',
            layer_id: 'layer-1',
            group_id: 'group-1',
            name: 'Legacy Point',
            geom_type: 'Point',
            coordinates: { lng: 105.8, lat: 21.02 } as any,
            properties: {},
            metadata: JSON.stringify({}),
        };

        const legacyLineFeature: FeatureState = {
            id: 'legacy-line',
            layer_id: 'layer-1',
            group_id: 'group-1',
            name: 'Legacy Line',
            geom_type: 'LineString',
            coordinates: { points: [{ lng: 105.8, lat: 21.02 }, [105.81, 21.03]] } as any,
            properties: {},
            metadata: JSON.stringify({}),
        };

        const legacyPolygonFeature: FeatureState = {
            id: 'legacy-poly',
            layer_id: 'layer-1',
            group_id: 'group-1',
            name: 'Legacy Poly',
            geom_type: 'Polygon',
            coordinates: { coordinates: [[{ x: 105.8, y: 21.02 }, [105.81, 21.03], [105.82, 21.04]]] } as any,
            properties: {},
            metadata: JSON.stringify({}),
        };

        const { collection } = buildMapLibreFeatureCollection({
            features: [legacyPointFeature, legacyLineFeature, legacyPolygonFeature],
            zoom: 20,
        });

        expect(collection.features).toHaveLength(3);
        expect(collection.features[0].geometry).toEqual({ type: 'Point', coordinates: [105.8, 21.02] });
        expect(collection.features[1].geometry).toEqual({ type: 'LineString', coordinates: [[105.8, 21.02], [105.81, 21.03]] });
        expect(collection.features[2].geometry).toEqual({ type: 'Polygon', coordinates: [[[105.8, 21.02], [105.81, 21.03], [105.82, 21.04]]] });
    });

    it('keeps valid polylines after point LOD caps and preserves legacy style', () => {
        const manyPoints = Array.from({ length: 2200 }, (_, index) => pointFeature(`p${index}`));
        const legacyLine: FeatureState = {
            id: 'legacy-line-after-points',
            layer_id: 'layer-1',
            group_id: 'group-1',
            name: 'Legacy Line After Points',
            geom_type: 'Polyline',
            coordinates: { points: [{ lng: 105.8, lat: 21.02 }, { lng: 105.82, lat: 21.04 }] } as any,
            properties: {},
            metadata: JSON.stringify({ gis: { color: '#06b6d4', size: 5, dashArray: [6, 3] } }),
        };

        const { collection, lodPolicy } = buildMapLibreFeatureCollection({
            features: [...manyPoints, legacyLine],
            zoom: 13,
        });

        const renderedLine = collection.features.find(feature => feature.properties.id === 'legacy-line-after-points');
        const renderedPoints = collection.features.filter(feature => feature.geometry.type === 'Point');

        expect(lodPolicy.level).toBe('summary');
        expect(renderedPoints).toHaveLength(lodPolicy.maxFeatures);
        expect(renderedLine?.geometry).toEqual({
            type: 'LineString',
            coordinates: [[105.8, 21.02], [105.82, 21.04]],
        });
        expect(renderedLine?.properties).toEqual(expect.objectContaining({
            color: '#06b6d4',
            size: 5,
            dashArray: [6, 3],
        }));
    });

    it('renders custom polyline geom_types such as SignalLine, NetworkLink, and Cable', () => {
        const signalLine: FeatureState = {
            id: 'signal-1',
            layer_id: 'layer-1',
            group_id: 'group-1',
            name: 'SignalLine 1',
            geom_type: 'SignalLine',
            coordinates: [[105.78, 21.04], [105.79, 21.05]],
            properties: {},
            metadata: JSON.stringify({ stroke: 22 }),
        };

        const networkLink: FeatureState = {
            id: 'network-1',
            layer_id: 'layer-1',
            group_id: 'group-1',
            name: 'NetworkLink 1',
            geom_type: 'NetworkLink',
            coordinates: [[105.80, 21.06], [105.81, 21.07]],
            properties: {},
            metadata: JSON.stringify({ weight: 14 }),
        };

        const { collection } = buildMapLibreFeatureCollection({
            features: [signalLine, networkLink],
            zoom: 20,
        });

        expect(collection.features).toHaveLength(2);
        expect(collection.features[0].geometry.type).toBe('LineString');
        expect(collection.features[0].properties.id).toBe('signal-1');
        expect(collection.features[0].properties.size).toBe(22);

        expect(collection.features[1].geometry.type).toBe('LineString');
        expect(collection.features[1].properties.id).toBe('network-1');
        expect(collection.features[1].properties.size).toBe(14);
    });

    it('renders the full GeoJSON geometry surface and keeps valid GeometryCollection children', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const features: FeatureState[] = [
            pointFeature('point'),
            pointFeature('multi-point', [0, 0], {
                geom_type: 'MultiPoint',
                coordinates: [[105.8, 21.02], [105.81, 21.03]] as any,
            }),
            pointFeature('line', [0, 0], {
                geom_type: 'LineString',
                coordinates: [[105.8, 21.02], [105.81, 21.03]] as any,
            }),
            pointFeature('multi-line', [0, 0], {
                geom_type: 'MultiLineString',
                coordinates: [
                    [[105.8, 21.02], [105.81, 21.03]],
                    [[105.82, 21.04], [105.83, 21.05]],
                ] as any,
            }),
            pointFeature('polygon', [0, 0], {
                geom_type: 'Polygon',
                coordinates: [[[105.8, 21.02], [105.81, 21.02], [105.81, 21.03], [105.8, 21.02]]] as any,
            }),
            pointFeature('multi-polygon', [0, 0], {
                geom_type: 'MultiPolygon',
                coordinates: [
                    [[[105.8, 21.02], [105.81, 21.02], [105.81, 21.03], [105.8, 21.02]]],
                    [[[105.9, 21.1], [105.91, 21.1], [105.91, 21.11], [105.9, 21.1]]],
                ] as any,
            }),
            pointFeature('collection', [0, 0], {
                geom_type: 'GeometryCollection',
                coordinates: {
                    type: 'GeometryCollection',
                    geometries: [
                        { type: 'Point', coordinates: [105.8, 21.02] },
                        { type: 'LineString', coordinates: [[105.82, 21.04], ['bad', 21.05]] },
                        { type: 'LineString', coordinates: [[105.83, 21.06], [105.84, 21.07]] },
                    ],
                } as any,
            }),
        ];

        const { collection } = buildMapLibreFeatureCollection({ features, zoom: 20 });
        const byId = Object.fromEntries(collection.features.map(feature => [feature.properties.id, feature]));

        expect(byId.point.geometry.type).toBe('Point');
        expect(byId['multi-point'].geometry.type).toBe('MultiPoint');
        expect(byId.line.geometry.type).toBe('LineString');
        expect(byId['multi-line'].geometry.type).toBe('MultiLineString');
        expect(byId.polygon.geometry.type).toBe('Polygon');
        expect(byId['multi-polygon'].geometry.type).toBe('MultiPolygon');
        expect(byId['collection::g0']).toEqual(expect.objectContaining({
            geometry: { type: 'Point', coordinates: [105.8, 21.02] },
            properties: expect.objectContaining({ parentFeatureId: 'collection' }),
        }));
        expect(byId['collection::g2']).toEqual(expect.objectContaining({
            geometry: { type: 'LineString', coordinates: [[105.83, 21.06], [105.84, 21.07]] },
            properties: expect.objectContaining({ parentFeatureId: 'collection' }),
        }));
        expect(byId['collection::g1']).toBeUndefined();
        expect(warn).toHaveBeenCalledWith('[mapLibreFastAdapter] Skipped invalid GeometryCollection child:', 'collection', 1);
        warn.mockRestore();
    });
});
