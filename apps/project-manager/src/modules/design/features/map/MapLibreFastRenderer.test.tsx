import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { queryVisibleFeaturesV2 } from '@SHARED/utils/designIpc';
import { MapLibreFastRenderer, clearMapImageCache } from './MapLibreFastRenderer';
import { MapProvider } from './MapContext';

const createDeferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/event', () => ({
    emit: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@SHARED/utils/designIpc', () => ({
    queryVisibleFeaturesV2: vi.fn(),
}));

const mockMapState = vi.hoisted(() => {
    type SourceRecord = {
        data: any;
        tiles?: string[];
        cluster?: boolean;
        clusterRadius?: number;
        clusterMaxZoom?: number;
        setData: (data: any) => void;
        setTiles: (tiles: string[]) => void;
        reload: () => void;
        getClusterExpansionZoom: (clusterId: number, callback?: (error: unknown, zoom: number) => void) => Promise<number> | undefined;
    };
    type HandlerRecord = {
        event: string;
        layers?: string | string[];
        handler: any;
    };

    let lastMap: any = null;
    let deferRenderLayerHydration = false;
    let styleLoaded = true;

    class MockMap {
        sources = new Map<string, SourceRecord>();
        layers = new Map<string, any>();
        images = new Set<string>();
        imageData = new Map<string, any>();
        handlers = new Map<string, any[]>();
        layerHandlers: HandlerRecord[] = [];
        movedLayers: string[] = [];
        setStyle = vi.fn();
        canvas = { style: { cursor: '' } };
        dragPan = { disable: vi.fn(), enable: vi.fn() };
        scrollZoom = { disable: vi.fn(), enable: vi.fn() };
        doubleClickZoom = { disable: vi.fn(), enable: vi.fn() };
        touchZoomRotate = { disable: vi.fn(), enable: vi.fn() };
        triggerRepaint = vi.fn();
        easeTo = vi.fn();
        fitBounds = vi.fn();
        setLayoutProperty = vi.fn((id: string, key: string, value: any) => {
            const layer = this.layers.get(id);
            if (layer) {
                layer.layout = { ...(layer.layout || {}), [key]: value };
            }
        });
        setPaintProperty = vi.fn((id: string, key: string, value: any) => {
            const layer = this.layers.get(id);
            if (layer) {
                layer.paint = { ...(layer.paint || {}), [key]: value };
            }
        });
        style: any;

        constructor(options: any = {}) {
            this.style = options.style;
            Object.entries(options.style?.sources || {}).forEach(([id, source]) => {
                this.addSource(id, source);
            });
            lastMap = this;
        }

        addSource(id: string, source: any) {
            const record: SourceRecord = {
                ...(source as any),
                data: source.data,
                tiles: source.tiles,
                setData: vi.fn((data: any) => {
                    record.data = data;
                }),
                setTiles: vi.fn((tiles: string[]) => {
                    record.tiles = tiles;
                }),
                reload: vi.fn(),
                getClusterExpansionZoom: vi.fn((_clusterId: number, callback?: (error: unknown, zoom: number) => void) => {
                    callback?.(null, 16);
                    return undefined;
                }),
            };
            this.sources.set(id, record);
        }

        getSource(id: string) {
            return this.sources.get(id);
        }

        addLayer(layer: any, beforeId?: string) {
            const isRenderLayer = layer.type === 'symbol' || layer.type === 'circle';
            const storedLayer = isRenderLayer
                ? deferRenderLayerHydration
                    ? { ...layer, layout: undefined, __pendingLayout: layer.layout || {} }
                    : { ...layer, layout: layer.layout || {} }
                : layer;
            if (beforeId && this.layers.has(beforeId)) {
                const entries = Array.from(this.layers.entries());
                this.layers.clear();
                for (const [id, existingLayer] of entries) {
                    if (id === beforeId) this.layers.set(storedLayer.id, storedLayer);
                    this.layers.set(id, existingLayer);
                }
                return;
            }
            this.layers.set(storedLayer.id, storedLayer);
        }

        getLayer(id: string) {
            return this.layers.get(id);
        }

        setFeatureState = vi.fn();
        hasImage(id: string) { return this.images.has(id); }
        addImage(id: string, image: any) {
            this.images.add(id);
            this.imageData.set(id, image);
        }
        isStyleLoaded() { return styleLoaded; }
        getZoom() { return 20; }
        getCenter() { return { lng: 105.8, lat: 21.02 }; }
        getBounds() {
            return {
                getSouth: () => 0,
                getNorth: () => 1,
                getWest: () => 0,
                getEast: () => 1,
            };
        }
        getCanvas() { return this.canvas; }
        getContainer() { return document.createElement('div'); }
        unproject() { return { lng: 105.8, lat: 21.02 }; }
        resize() {}
        flyTo() {}
        jumpTo() {}
        moveLayer(id: string) {
            this.movedLayers.push(id);
        }
        removeLayer(id: string) {
            this.layers.delete(id);
        }
        removeSource(id: string) {
            this.sources.delete(id);
        }
        remove() {}

        on(event: string, ...args: any[]) {
            const handler = args[args.length - 1];
            this.handlers.set(event, [...(this.handlers.get(event) || []), handler]);
            if (args.length > 1) {
                this.layerHandlers.push({ event, layers: args[0], handler });
            }
        }

        once(event: string, handler: any) {
            if (event === 'idle') {
                requestAnimationFrame(handler);
                return;
            }
            if (event === 'styledata' || event === 'load') {
                this.on(event, handler);
                return;
            }
            handler();
        }

        hydrateRenderLayers() {
            this.layers.forEach(layer => {
                if (layer.__pendingLayout) {
                    layer.layout = layer.__pendingLayout;
                    delete layer.__pendingLayout;
                }
            });
        }

        emit(event: string, payload?: any) {
            (this.handlers.get(event) || []).forEach(handler => handler(payload));
        }
    }

    return {
        MockMap,
        getLastMap: () => lastMap,
        clearLastMap: () => { lastMap = null; },
        setDeferRenderLayerHydration: (value: boolean) => { deferRenderLayerHydration = value; },
        setStyleLoaded: (value: boolean) => { styleLoaded = value; },
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
        clearMapImageCache();
        mockMapState.clearLastMap();
        mockMapState.setDeferRenderLayerHydration(false);
        mockMapState.setStyleLoaded(true);
        vi.mocked(queryVisibleFeaturesV2).mockReset();
        vi.mocked(queryVisibleFeaturesV2).mockResolvedValue({
            features: [],
            total: 0,
            returned: 0,
            truncated: false,
            limit: 10000,
            revision: 0,
            requestId: 1,
        });
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 36, height: 36, close: () => {} })));
        vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() });
        vi.stubGlobal('ResizeObserver', class {
            observe() {}
            disconnect() {}
        });
        const originalCreateElement = document.createElement.bind(document);
        const dummyBuffer = new Uint8ClampedArray(36 * 36 * 4);
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
            if (tagName.toLowerCase() === 'canvas') {
                const canvas = originalCreateElement('canvas') as HTMLCanvasElement;
                let width = 0;
                let height = 0;
                Object.defineProperty(canvas, 'width', {
                    get: () => width,
                    set: value => { width = Number(value); },
                    configurable: true,
                });
                Object.defineProperty(canvas, 'height', {
                    get: () => height,
                    set: value => { height = Number(value); },
                    configurable: true,
                });
                canvas.getContext = vi.fn(() => ({
                    clearRect: vi.fn(),
                    beginPath: vi.fn(),
                    arc: vi.fn(),
                    fill: vi.fn(),
                    stroke: vi.fn(),
                    drawImage: vi.fn(),
                    getImageData: vi.fn(() => ({
                        width: width || 36,
                        height: height || 36,
                        data: dummyBuffer,
                    })),
                })) as any;
                return canvas;
            }
            return originalCreateElement(tagName, options);
        }) as any);
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
            viewportQueryRevision: 0,
            mapRenderEngine: 'maplibre-fast',
            showFeatureGroups: true,
            groupThemePreview: null,
        } as any);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('waits for the MapLibre style before installing the camera bridge layer', async () => {
        mockMapState.setStyleLoaded(false);

        const { container } = render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);
        const map = mockMapState.getLastMap();

        expect(map?.getLayer('design-camera-bridge')).toBeUndefined();
        expect(container.querySelector('[data-testid="maplibre-fast-renderer"]')?.getAttribute('data-map-state')).toBe('initializing');

        mockMapState.setStyleLoaded(true);
        await act(async () => {
            map.emit('load');
        });

        await waitFor(() => {
            expect(map.getLayer('design-camera-bridge')).toBeTruthy();
            expect(container.querySelector('[data-testid="maplibre-fast-renderer"]')?.getAttribute('data-map-state')).toBe('ready');
        });
    });

    it('keeps the owned map stable when publishing it through MapContext', async () => {
        render(
            <MapProvider>
                <MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />
            </MapProvider>
        );
        const map = mockMapState.getLastMap();

        await waitFor(() => {
            expect(map?.getLayer('design-camera-bridge')).toBeTruthy();
        });
        expect(mockMapState.getLastMap()).toBe(map);
    });

    it.each(['cctv', 'lpr', 'speed'])('creates icon-backed point data and layers for %s features', async (icon) => {
        useDesignSync.setState({
            state: {
                features: {
                    'camera-1': pointFeature('camera-1', { icon, size: 24 }),
                },
                feature_groups: { 'group-1': { type: 'CAMERA', name: 'Camera' } },
                isLargeProject: false,
            } as any,
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            const lastMap = mockMapState.getLastMap();
            expect(lastMap?.layers.get('design-fast-point-icons')).toBeTruthy();
            expect(lastMap?.layers.get('design-fast-points')?.filter).toEqual(expect.arrayContaining([
                ['!', ['has', 'point_count']],
            ]));
            const data = lastMap?.sources.get('design-fast-point-clusters-source')?.data;
            expect(data.features[0].properties).toEqual(expect.objectContaining({
                id: 'camera-1',
                iconKey: icon,
                isCamera: true,
                color: '#6366f1',
                iconColor: '#6366f1',
                displaySize: 24,
                labelIndex: '1',
            }));
            const iconImageId = data.features[0].properties.iconImageId;
            expect(iconImageId).toContain(`design-point-${icon}`);
            expect(lastMap?.images.has(iconImageId)).toBe(true);
            expect(lastMap?.imageData.get(iconImageId)).toEqual(expect.objectContaining({
                width: 24,
                height: 24,
                data: expect.any(Uint8ClampedArray),
            }));
            expect(lastMap?.triggerRepaint).toHaveBeenCalled();
        });
    });

    it('waits for render layer hydration before publishing point data', async () => {
        mockMapState.setDeferRenderLayerHydration(true);
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

        await waitFor(() => expect(mockMapState.getLastMap()).toBeTruthy());
        const map = mockMapState.getLastMap();
        const clusterSource = map.sources.get('design-fast-point-clusters-source');
        expect(clusterSource?.setData).not.toHaveBeenCalled();

        await act(async () => {
            map.hydrateRenderLayers();
            map.emit('styledata');
        });

        await waitFor(() => {
            expect(clusterSource?.setData).toHaveBeenCalled();
            const data = clusterSource?.data;
            expect(data.features[0].properties.iconImageId).toContain('design-point-cctv');
        });
    });

    it('renders a group theme preview icon through the MapLibre source', async () => {
        useDesignSync.setState({
            state: {
                features: {
                    'camera-1': pointFeature('camera-1'),
                },
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: false,
            } as any,
            groupThemePreview: {
                groupId: 'group-1',
                config: {
                    icon: 'lpr',
                    color: '#2563eb',
                    size: 24,
                    gis: { color: '#2563eb', size: 24 },
                },
            },
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            const lastMap = mockMapState.getLastMap();
            const data = lastMap?.sources.get('design-fast-point-clusters-source')?.data;
            const properties = data.features[0].properties;
            expect(properties.iconKey).toBe('lpr');
            expect(properties.iconImageId).toContain('design-point-lpr');
            expect(lastMap?.images.has(properties.iconImageId)).toBe(true);
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
            const labelLayer = lastMap?.layers.get('design-fast-point-labels');
            const data = lastMap?.sources.get('design-fast-point-clusters-source')?.data;

            expect(pointLayer?.type).toBe('circle');
            expect(pointLayer?.filter).toEqual(expect.arrayContaining([['!', ['has', 'point_count']]]));
            expect(pointLayer?.paint['circle-radius']).toEqual(expect.arrayContaining(['case']));
            expect(pointLayer?.paint['circle-opacity']).toEqual(expect.arrayContaining([
                ['to-boolean', ['get', 'iconImageId']],
                0,
            ]));
            expect(pointLayer?.paint['circle-stroke-width']).toEqual(expect.arrayContaining([
                ['to-boolean', ['get', 'iconImageId']],
                0,
            ]));
            expect(labelLayer?.layout['text-field']).toEqual(['get', 'labelIndex']);
            expect(data.features[0].properties).toEqual(expect.objectContaining({
                id: 'point-1',
                color: '#ef4444',
                displaySize: 14,
                iconImageId: '',
                labelIndex: '1',
            }));
        });
    });

    it('keeps point features out of the main MapLibre source when overlayPoints is enabled', async () => {
        useDesignSync.setState({
            state: {
                features: {
                    'point-1': pointFeature('point-1', { color: '#ef4444', size: 14 }),
                },
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: false,
            } as any,
        } as any);

        render(
            <MapLibreFastRenderer
                center={[21.02, 105.8]}
                zoom={20}
                renderFlags={{ overlayPoints: true }}
            />
        );

        await waitFor(() => {
            const lastMap = mockMapState.getLastMap();
            const data = lastMap?.sources.get('design-fast-features')?.data;
            expect(data.features).toHaveLength(0);
            expect(document.querySelector('[data-map-overlay-canvas="features"]')).toBeTruthy();
        });
    });

    it('feeds the cluster source when overlayPoints is enabled and grouping is on', async () => {
        useDesignSync.setState({
            showFeatureGroups: true,
            state: {
                features: {
                    'point-1': pointFeature('point-1', { color: '#ef4444', size: 14 }),
                },
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: false,
            } as any,
        } as any);

        render(
            <MapLibreFastRenderer
                center={[21.02, 105.8]}
                zoom={20}
                renderFlags={{ overlayPoints: true }}
            />
        );

        await waitFor(() => {
            const clusterSource = mockMapState.getLastMap()?.sources.get('design-fast-point-clusters-source');
            expect(clusterSource).toEqual(expect.objectContaining({ cluster: true }));
            expect(clusterSource?.data.features).toHaveLength(1);
            expect(clusterSource?.data.features[0].properties.id).toBe('point-1');
        });
    });

    it('leaves the cluster source empty when overlayPoints is enabled and grouping is off', async () => {
        useDesignSync.setState({
            showFeatureGroups: false,
            state: {
                features: {
                    'point-1': pointFeature('point-1', { color: '#ef4444', size: 14 }),
                },
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: false,
            } as any,
        } as any);

        render(
            <MapLibreFastRenderer
                center={[21.02, 105.8]}
                zoom={20}
                renderFlags={{ overlayPoints: true }}
            />
        );

        await waitFor(() => {
            const clusterSource = mockMapState.getLastMap()?.sources.get('design-fast-point-clusters-source');
            expect(clusterSource).toEqual(expect.objectContaining({ cluster: false }));
            expect(clusterSource?.data.features).toHaveLength(0);
        });
    });

    it('does not set MapLibre data again for point-only updates when overlayPoints is enabled', async () => {
        useDesignSync.setState({
            state: {
                features: {
                    'point-1': pointFeature('point-1', { color: '#ef4444', size: 14 }),
                },
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: false,
                mapRevision: 1,
            } as any,
        } as any);

        render(
            <MapLibreFastRenderer
                center={[21.02, 105.8]}
                zoom={20}
                renderFlags={{ overlayPoints: true }}
            />
        );

        let setData: any;
        await waitFor(() => {
            setData = mockMapState.getLastMap()?.sources.get('design-fast-features')?.setData;
            expect(setData).toHaveBeenCalled();
        });
        const callsBefore = setData.mock.calls.length;

        await act(async () => {
            useDesignSync.setState({
                state: {
                    features: {
                        'point-1': pointFeature('point-1', { color: '#22c55e', size: 16 }),
                    },
                    feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                    isLargeProject: false,
                    mapRevision: 2,
                } as any,
            } as any);
        });
        await Promise.resolve();

        expect(setData).toHaveBeenCalledTimes(callsBefore);
    });

    it('uses a circle fallback until point icon images finish loading', async () => {
        const bitmap = { width: 36, height: 36, close: () => {} };
        const deferredBitmap = createDeferred<typeof bitmap>();
        vi.stubGlobal('createImageBitmap', vi.fn(() => deferredBitmap.promise));
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
            const data = mockMapState.getLastMap()?.sources.get('design-fast-point-clusters-source')?.data;
            expect(data.features[0].properties.iconImageId).toBe('');
        });

        deferredBitmap.resolve(bitmap);

        await waitFor(() => {
            const data = mockMapState.getLastMap()?.sources.get('design-fast-point-clusters-source')?.data;
            expect(data.features[0].properties.iconImageId).toContain('design-point-cctv');
            expect(mockMapState.getLastMap()?.images.has(data.features[0].properties.iconImageId)).toBe(true);
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

    it('uses a point-only clustered source while keeping routes on the main source', async () => {
        useDesignSync.setState({
            state: {
                features: { 'point-1': pointFeature('point-1'), 'line-1': lineFeature },
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: false,
            } as any,
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={12} />);

        await waitFor(() => {
            const lastMap = mockMapState.getLastMap();
            const source = lastMap?.sources.get('design-fast-features');
            const clusterSource = lastMap?.sources.get('design-fast-point-clusters-source');

            expect(source).toEqual(expect.not.objectContaining({
                cluster: true,
            }));
            expect(clusterSource).toEqual(expect.objectContaining({
                cluster: true,
                clusterRadius: 48,
                maxzoom: 23,
                clusterMaxZoom: 22,
            }));
            expect(source?.data.features.some((feature: any) => feature.geometry.type === 'LineString')).toBe(true);
            expect(clusterSource?.data.features).toHaveLength(1);
            expect(clusterSource?.data.features[0].geometry.type).toBe('Point');
            expect(lastMap?.layers.get('design-fast-point-clusters')).toBeTruthy();
            expect(lastMap?.layers.get('design-fast-point-cluster-counts')).toEqual(expect.objectContaining({
                id: 'design-fast-point-cluster-counts',
                type: 'symbol',
                source: 'design-fast-point-clusters-source',
            }));
            expect(lastMap?.layers.get('design-fast-point-cluster-counts')?.layout['text-field']).toEqual(['get', 'point_count_abbreviated']);
        });
    });

    it('excludes objects inside an intersection from the cluster source count', async () => {
        useDesignSync.setState({
            state: {
                features: {
                    'standalone-point': pointFeature('standalone-point'),
                    'intersection-child-point': {
                        ...pointFeature('intersection-child-point'),
                        parent_feature_id: 'intersection-node-1',
                    },
                },
                feature_groups: {
                    'group-1': { type: 'NODE', name: 'Node' },
                },
                isLargeProject: false,
            } as any,
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={12} />);

        await waitFor(() => {
            const lastMap = mockMapState.getLastMap();
            const clusterSource = lastMap?.sources.get('design-fast-point-clusters-source');

            expect(clusterSource?.data.features).toHaveLength(1);
            expect(clusterSource?.data.features[0].properties.id).toBe('standalone-point');
        });
    });

    it('rebuilds the point source when grouping is enabled after rendering plain points', async () => {
        useDesignSync.setState({
            showFeatureGroups: false,
            state: {
                features: {
                    'point-1': pointFeature('point-1'),
                },
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: false,
            } as any,
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            const clusterSource = mockMapState.getLastMap()?.sources.get('design-fast-point-clusters-source');
            expect(clusterSource).toEqual(expect.objectContaining({ cluster: false }));
            expect(clusterSource?.data.features).toHaveLength(1);
        });

        await act(async () => {
            useDesignSync.setState({ showFeatureGroups: true } as any);
        });

        await waitFor(() => {
            const clusterSource = mockMapState.getLastMap()?.sources.get('design-fast-point-clusters-source');
            expect(clusterSource).toEqual(expect.objectContaining({ cluster: true }));
            expect(clusterSource?.data.features).toHaveLength(1);
        });
    });

    it('zooms to a cluster expansion level when a cluster is clicked', async () => {
        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={12} />);

        await waitFor(() => {
            expect(mockMapState.getLastMap()?.layerHandlers.some((record: any) => (
                record.event === 'click' && record.layers === 'design-fast-point-clusters'
            ))).toBe(true);
        });

        const lastMap = mockMapState.getLastMap();
        const clusterClickHandler = lastMap?.layerHandlers.find((record: any) => (
            record.event === 'click' && record.layers === 'design-fast-point-clusters'
        ))?.handler;

        clusterClickHandler?.({
            features: [{
                geometry: { type: 'Point', coordinates: [105.8, 21.02] },
                properties: { cluster_id: 7 },
            }],
        });

        expect(lastMap?.sources.get('design-fast-point-clusters-source')?.getClusterExpansionZoom).toHaveBeenCalledWith(7, expect.any(Function));
        expect(lastMap?.sources.get('design-fast-features')?.getClusterExpansionZoom).not.toHaveBeenCalled();
        expect(lastMap?.easeTo).toHaveBeenCalledWith({
            center: [105.8, 21.02],
            zoom: 16,
            duration: 250,
        });
    });

    it('uses the latest selection action when a map feature is clicked', async () => {
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
            expect(mockMapState.getLastMap()?.layerHandlers.some((record: any) => record.event === 'click')).toBe(true);
        });

        const latestSelectFeature = vi.fn();
        await act(async () => {
            useDesignSync.setState({ selectFeature: latestSelectFeature } as any);
        });

        const clickHandler = mockMapState.getLastMap()?.layerHandlers.find((record: any) => (
            record.event === 'click' && Array.isArray(record.layers) && record.layers.includes('design-fast-points')
        ))?.handler;

        clickHandler?.({
            features: [{ properties: { id: 'point-1' } }],
            lngLat: { lat: 21.02, lng: 105.8 },
        });

        expect(latestSelectFeature).toHaveBeenCalledWith('point-1', false, [21.02, 105.8]);
    });

    it('does not set feature GeoJSON data again for selection-only changes', async () => {
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

        let setData: any;
        await waitFor(() => {
            setData = mockMapState.getLastMap()?.sources.get('design-fast-features')?.setData;
            expect(setData).toHaveBeenCalled();
        });
        const initialSetDataCalls = setData.mock.calls.length;

        await act(async () => {
            useDesignSync.setState({ selectedFeatureId: 'point-1' } as any);
        });

        expect(setData).toHaveBeenCalledTimes(initialSetDataCalls);
    });

    it('applies selection through MapLibre feature state after data is ready', async () => {
        useDesignSync.setState({
            state: {
                features: {
                    'point-1': pointFeature('point-1', { color: '#ef4444', size: 14 }),
                },
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: false,
            } as any,
            selectedFeatureId: 'point-1',
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            expect(mockMapState.getLastMap()?.setFeatureState).toHaveBeenCalledWith(
                { source: 'design-fast-features', id: 'point-1' },
                { selected: true }
            );
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

    it('queries viewport features with fast payload for viewport-first projects', async () => {
        const visibleFeature = pointFeature('visible-1', { color: '#ef4444', size: 14 });
        vi.mocked(queryVisibleFeaturesV2).mockResolvedValue({
            features: [visibleFeature as any],
            total: 1,
            returned: 1,
            truncated: false,
            limit: 10000,
            revision: 9,
            requestId: 1,
        });
        useDesignSync.setState({
            projectId: 'project-1',
            state: {
                features: {},
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: true,
                viewportFeatureLimit: 10000,
                mapRevision: 9,
            } as any,
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            expect(queryVisibleFeaturesV2).toHaveBeenCalledWith(
                'project-1',
                { s: 0, n: 1, w: 0, e: 1 },
                20,
                [],
                10000,
                true,
                9,
                expect.any(Number)
            );
            expect(useDesignSync.getState().visibleFeatures['visible-1']).toBeDefined();
            expect(useDesignSync.getState().visibleFeatures['visible-1'].id).toBe('visible-1');
        });
    });

    it('requeries viewport features after a large-project feature event', async () => {
        const createdFeature = pointFeature('created-1', { color: '#ef4444', size: 14 });
        let featureEventApplied = false;
        vi.mocked(queryVisibleFeaturesV2).mockImplementation(async () => featureEventApplied
            ? {
                features: [createdFeature as any],
                total: 1,
                returned: 1,
                truncated: false,
                limit: 10000,
                revision: 9,
                requestId: 2,
            }
            : {
                features: [],
                total: 0,
                returned: 0,
                truncated: false,
                limit: 10000,
                revision: 9,
                requestId: 1,
            });

        useDesignSync.setState({
            projectId: 'project-1',
            state: {
                features: {},
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: true,
                viewportFeatureLimit: 10000,
                mapRevision: 9,
            } as any,
            viewportQueryRevision: 0,
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => expect(queryVisibleFeaturesV2).toHaveBeenCalled());
        const queryCountBeforeEvent = vi.mocked(queryVisibleFeaturesV2).mock.calls.length;
        featureEventApplied = true;

        await act(async () => {
            useDesignSync.getState().applyPatchToState({
                success: true,
                event_id: 'event-create-renderer',
                applied_event: {
                    type: 'FeatureCreated',
                    payload: createdFeature as any,
                },
                side_effects: [],
            });
        });

        await waitFor(() => {
            expect(vi.mocked(queryVisibleFeaturesV2).mock.calls.length).toBeGreaterThan(queryCountBeforeEvent);
            expect(useDesignSync.getState().visibleFeatures['created-1']).toBeDefined();
        });
    });

    it('does not query viewport features for non-large local projects', async () => {
        useDesignSync.setState({
            projectId: 'project-1',
            state: {
                features: {
                    'point-1': pointFeature('point-1', { color: '#ef4444', size: 14 }),
                },
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: false,
                viewportFeatureLimit: 10000,
                mapRevision: 9,
            } as any,
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            expect(mockMapState.getLastMap()?.sources.get('design-fast-point-clusters-source')?.data.features.length).toBe(1);
        });

        expect(queryVisibleFeaturesV2).not.toHaveBeenCalled();
    });

    it('does not reapply identical feature data when viewport bookkeeping changes', async () => {
        useDesignSync.setState({
            state: {
                features: {
                    'point-1': pointFeature('point-1', { color: '#ef4444', size: 14 }),
                },
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: false,
                mapRevision: 9,
            } as any,
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            const source = mockMapState.getLastMap()?.sources.get('design-fast-point-clusters-source');
            expect(source?.data.features.length).toBe(1);
            expect(source?.setData).toHaveBeenCalled();
        });

        const source = mockMapState.getLastMap()?.sources.get('design-fast-features');
        vi.mocked(source!.setData).mockClear();

        await act(async () => {
            useDesignSync.setState({ viewportRevision: 99 } as any);
        });
        await Promise.resolve();

        expect(source?.setData).not.toHaveBeenCalled();
    });

    it('deduplicates missing icon preloads across multiple features sharing the same icon style', async () => {
        const manyCameras = Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [`cam-${i}`, pointFeature(`cam-${i}`, { icon: 'cctv', size: 24, color: '#6366f1' })])
        );
        useDesignSync.setState({
            state: {
                features: manyCameras,
                feature_groups: { 'group-1': { type: 'CAMERA', name: 'Camera' } },
                isLargeProject: false,
            } as any,
        } as any);

        render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={20} />);

        await waitFor(() => {
            const lastMap = mockMapState.getLastMap();
            const data = lastMap?.sources.get('design-fast-point-clusters-source')?.data;
            expect(data.features.length).toBe(50);
            // Verify all features receive iconImageId after batch RAF update
            const sampleIconId = data.features[0].properties.iconImageId;
            expect(sampleIconId).toContain('design-point-cctv');
            expect(lastMap?.images.has(sampleIconId)).toBe(true);
        });
    });

    it('reuses GeoJSON collection within the same quantized zoom bucket across continuous zoom micro-changes', async () => {
        useDesignSync.setState({
            state: {
                features: {
                    'point-1': pointFeature('point-1', { color: '#ef4444', size: 14 }),
                },
                feature_groups: { 'group-1': { type: 'NODE', name: 'Node' } },
                isLargeProject: false,
            } as any,
        } as any);

        const { rerender } = render(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={15.1} />);

        let setDataMock: any;
        await waitFor(() => {
            const lastMap = mockMapState.getLastMap();
            setDataMock = lastMap?.sources.get('design-fast-features')?.setData;
            expect(setDataMock).toHaveBeenCalled();
        });

        const callsBefore = setDataMock.mock.calls.length;

        // Micro-zoom change within the same bucket [15.0..16.99]
        rerender(<MapLibreFastRenderer center={[21.02, 105.8]} zoom={16.4} />);

        await act(async () => {
            await Promise.resolve();
        });

        // GeoJSON setData should NOT be re-invoked because zoom stayed inside bucket 16
        expect(setDataMock.mock.calls.length).toBe(callsBefore);
    });

});
