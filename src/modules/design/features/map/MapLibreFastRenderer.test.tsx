import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { MapLibreFastRenderer } from './MapLibreFastRenderer';

vi.mock('./useMapStyles', () => ({
    useMapStyles: () => ({
        getStyledUrl: () => 'https://tiles.example/{z}/{x}/{y}.png',
        mapKey: 'test-map',
    }),
}));

vi.mock('@TOOL/utils/designIpc', () => ({
    queryVisibleFeaturesV2: vi.fn(),
}));

const mockMapState = vi.hoisted(() => {
    type SourceRecord = {
        data: any;
        setData: (data: any) => void;
    };
    type HandlerRecord = {
        event: string;
        layers?: string | string[];
        handler: any;
    };

    let lastMap: any = null;

    class MockMap {
        sources = new Map<string, SourceRecord>();
        layers = new Map<string, any>();
        images = new Set<string>();
        handlers = new Map<string, any[]>();
        layerHandlers: HandlerRecord[] = [];
        movedLayers: string[] = [];
        canvas = { style: { cursor: '' } };
        dragPan = { disable: vi.fn(), enable: vi.fn() };

        constructor() {
            lastMap = this;
        }

        addSource(id: string, source: any) {
            this.sources.set(id, {
                data: source.data,
                setData: (data: any) => {
                    this.sources.get(id)!.data = data;
                },
            });
        }

        getSource(id: string) {
            return this.sources.get(id);
        }

        addLayer(layer: any) {
            this.layers.set(layer.id, layer);
        }

        getLayer(id: string) {
            return this.layers.get(id);
        }

        setLayoutProperty() {}
        setFeatureState() {}
        hasImage(id: string) { return this.images.has(id); }
        addImage(id: string) { this.images.add(id); }
        isStyleLoaded() { return true; }
        getZoom() { return 20; }
        getBounds() {
            return {
                getSouth: () => 0,
                getNorth: () => 1,
                getWest: () => 0,
                getEast: () => 1,
            };
        }
        getCanvas() { return this.canvas; }
        fitBounds() {}
        flyTo() {}
        setStyle() {}
        moveLayer(id: string) {
            this.movedLayers.push(id);
        }
        remove() {}

        on(event: string, ...args: any[]) {
            const handler = args[args.length - 1];
            this.handlers.set(event, [...(this.handlers.get(event) || []), handler]);
            if (args.length > 1) {
                this.layerHandlers.push({ event, layers: args[0], handler });
            }
        }

        once(_event: string, handler: any) {
            handler();
        }
    }

    return {
        MockMap,
        getLastMap: () => lastMap,
        clearLastMap: () => { lastMap = null; },
    };
});

vi.mock('maplibre-gl', () => ({
    default: {
        Map: mockMapState.MockMap,
    },
}));

const pointFeature = (id: string, metadata: any = {}) => ({
    id,
    layer_id: 'layer-1',
    group_id: 'group-1',
    name: id,
    geom_type: 'Point',
    coordinates: [105.8, 21.02],
    properties: {},
    metadata: JSON.stringify(metadata),
});

const lineFeature = {
    id: 'line-1',
    layer_id: 'layer-1',
    group_id: 'group-1',
    name: 'line-1',
    geom_type: 'LineString',
    coordinates: [[105.8, 21.02], [105.81, 21.03]],
    properties: {},
    metadata: '{}',
};

describe('MapLibreFastRenderer', () => {
    beforeEach(() => {
        mockMapState.clearLastMap();
        useDesignSync.setState({
            visibleFeatures: {},
            state: {
                features: {},
                feature_groups: {},
                isLargeProject: false,
            } as any,
            mapHiddenIds: new Set(),
            selectedFeatureId: null,
            drawingMode: 'none',
            editingFeatureId: null,
            currentDrawingPoints: [],
            snappedPoint: null,
            viewportRevision: 0,
            mapRenderEngine: 'maplibre-fast',
        } as any);
    });

    it('creates icon-backed point data and layers for camera features', async () => {
        useDesignSync.setState({
            state: {
                features: {
                    'camera-1': pointFeature('camera-1', { icon: 'cctv', size: 24 }),
                },
                feature_groups: { 'group-1': { type: 'CAMERA', name: 'Camera' } },
                isLargeProject: false,
            } as any,
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            const lastMap = mockMapState.getLastMap();
            expect(lastMap?.layers.get('design-fast-point-icons')).toBeTruthy();
            expect(lastMap?.layers.get('design-fast-points')?.filter).toEqual([
                'all',
                ['==', ['geometry-type'], 'Point'],
                ['!', ['has', 'point_count']],
            ]);
            const data = lastMap?.sources.get('design-fast-features')?.data;
            expect(data.features[0].properties).toEqual(expect.objectContaining({
                id: 'camera-1',
                iconKey: 'cctv',
                isCamera: true,
                color: '#10b981',
                displaySize: 36,
                labelIndex: '1',
            }));
            expect(data.features[0].properties.iconImageId).toContain('design-point-cctv');
        });
    });

    it('keeps ordinary point circles visible without icon images', async () => {
        useDesignSync.setState({
            state: {
                features: {
                    'point-1': pointFeature('point-1', { color: '#ef4444', size: 14 }),
                },
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: false,
            } as any,
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            const lastMap = mockMapState.getLastMap();
            const pointLayer = lastMap?.layers.get('design-fast-points');
            const data = lastMap?.sources.get('design-fast-features')?.data;

            expect(pointLayer?.type).toBe('circle');
            expect(pointLayer?.paint['circle-radius']).toEqual(expect.arrayContaining(['case']));
            expect(data.features[0].properties).toEqual(expect.objectContaining({
                id: 'point-1',
                color: '#ef4444',
                displaySize: 14,
                iconImageId: expect.stringContaining('design-point'),
            }));
        });
    });

    it('adds a transparent line hit layer to the interactive map handlers', async () => {
        useDesignSync.setState({
            state: {
                features: { 'line-1': lineFeature },
                feature_groups: {},
                isLargeProject: false,
            } as any,
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            const lastMap = mockMapState.getLastMap();
            expect(lastMap?.layers.get('design-fast-line-hit-area')).toEqual(expect.objectContaining({
                id: 'design-fast-line-hit-area',
                type: 'line',
                source: 'design-fast-features',
            }));
            expect(lastMap?.layers.get('design-fast-line-hit-area')?.paint).toEqual(expect.objectContaining({
                'line-opacity': 0.01,
            }));

            const clickLayers = lastMap?.layerHandlers.find((record: any) => record.event === 'click' && Array.isArray(record.layers))?.layers;
            const moveLayers = lastMap?.layerHandlers.find((record: any) => record.event === 'mousemove' && Array.isArray(record.layers))?.layers;
            expect(clickLayers).toContain('design-fast-line-hit-area');
            expect(moveLayers).toContain('design-fast-line-hit-area');
        });
    });

    it('publishes snap indicator data to the drawing overlay source', async () => {
        useDesignSync.setState({
            drawingMode: 'polyline',
            snappedPoint: { x: 105.8, y: 21.02, id: 'camera-1' },
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            const data = mockMapState.getLastMap()?.sources.get('design-fast-drawing')?.data;
            expect(data.features).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    geometry: { type: 'Point', coordinates: [105.8, 21.02] },
                    properties: { kind: 'snap' },
                }),
            ]));
        });
    });

    it('publishes edit vertex and midpoint data for the selected editing feature', async () => {
        useDesignSync.setState({
            state: {
                features: { 'line-1': lineFeature },
                feature_groups: {},
                isLargeProject: false,
            } as any,
            editingFeatureId: 'line-1',
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            const lastMap = mockMapState.getLastMap();
            const data = lastMap?.sources.get('design-fast-edit-handles')?.data;
            expect(data.features.map((feature: any) => feature.properties.kind)).toEqual(['vertex', 'vertex', 'midpoint']);
            expect(lastMap?.movedLayers).toEqual(expect.arrayContaining([
                'design-fast-snap-indicator',
                'design-fast-edit-vertices',
                'design-fast-edit-midpoints',
            ]));
        });
    });

    it('publishes stored polyline snap-link markers for the selected feature', async () => {
        useDesignSync.setState({
            state: {
                features: {
                    'line-1': {
                        ...lineFeature,
                        metadata: JSON.stringify({ snap_links: { v0: 'point-a' } }),
                    },
                    'point-a': pointFeature('point-a', { color: '#ef4444', size: 12 }),
                },
                feature_groups: {},
                isLargeProject: false,
            } as any,
            selectedFeatureId: 'line-1',
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            const lastMap = mockMapState.getLastMap();
            const data = lastMap?.sources.get('design-fast-edit-handles')?.data;

            expect(lastMap?.layers.get('design-fast-edit-snap-links')).toEqual(expect.objectContaining({
                id: 'design-fast-edit-snap-links',
                type: 'circle',
                source: 'design-fast-edit-handles',
            }));
            expect(data.features).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    geometry: { type: 'Point', coordinates: [105.8, 21.02] },
                    properties: { kind: 'snap-link', index: 0, targetId: 'point-a' },
                }),
            ]));
            expect(lastMap?.movedLayers).toContain('design-fast-edit-snap-links');
        });
    });

    it('resolves snap-link targets from visible features in large-project rendering', async () => {
        useDesignSync.setState({
            visibleFeatures: {
                'point-a': {
                    ...pointFeature('point-a', { color: '#ef4444', size: 12 }),
                    coordinates: [105.9, 21.09],
                },
            },
            state: {
                features: {
                    'line-1': {
                        ...lineFeature,
                        metadata: JSON.stringify({ snap_links: { v0: 'point-a' } }),
                    },
                },
                feature_groups: {},
                isLargeProject: true,
            } as any,
            selectedFeatureId: 'line-1',
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            const data = mockMapState.getLastMap()?.sources.get('design-fast-edit-handles')?.data;

            expect(data.features).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    geometry: { type: 'Point', coordinates: [105.9, 21.09] },
                    properties: { kind: 'snap-link', index: 0, targetId: 'point-a' },
                }),
            ]));
        });
    });
});
