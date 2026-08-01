import { afterEach, describe, expect, it, vi } from 'vitest';
import { BasemapRuntime } from './BasemapRuntime';

const mapState = vi.hoisted(() => {
    let instances = 0;
    const maps: any[] = [];

    class MockMap {
        sources = new Map<string, any>();
        handlers = new Map<string, any[]>();
        removed = false;
        container: HTMLElement;
        canvas = { width: 300, height: 150 };
        jumpTo = vi.fn();
        easeTo = vi.fn();
        fitBounds = vi.fn();
        resize = vi.fn();
        remove = vi.fn(() => {
            this.removed = true;
        });

        constructor(options: any) {
            instances += 1;
            this.container = options.container;
            Object.entries(options.style?.sources || {}).forEach(([id, source]) => {
                this.sources.set(id, {
                    ...(source as any),
                    setTiles: vi.fn(),
                    reload: vi.fn(),
                });
            });
            maps.push(this);
        }

        getCanvas() { return this.canvas; }
        getContainer() { return this.container; }
        getCenter() { return { lng: 105.8, lat: 21.02 }; }
        getZoom() { return 13; }
        getBearing() { return 0; }
        getPitch() { return 0; }
        getSource(id: string) { return this.sources.get(id); }
        on(event: string, handler: any) {
            const handlers = this.handlers.get(event) || [];
            handlers.push(handler);
            this.handlers.set(event, handlers);
        }
        once(event: string, handler: any) {
            this.on(event, handler);
        }
        emit(event: string, payload?: any) {
            (this.handlers.get(event) || []).forEach(handler => handler(payload));
        }
    }

    return {
        MockMap,
        getInstances: () => instances,
        getLastMap: () => maps[maps.length - 1],
        reset: () => {
            instances = 0;
            maps.length = 0;
        },
    };
});

vi.mock('maplibre-gl', () => ({ default: { Map: mapState.MockMap } }));

describe('BasemapRuntime', () => {
    afterEach(() => {
        mapState.reset();
    });

    it('initializes once and publishes lifecycle without project state', async () => {
        const runtime = new BasemapRuntime();
        const states: string[] = [];
        runtime.subscribeLifecycle(state => states.push(state));

        await runtime.initialize(document.createElement('div'));
        await runtime.initialize(document.createElement('div'));
        mapState.getLastMap().emit('render');

        expect(mapState.getInstances()).toBe(1);
        expect(states).toContain('map-created');
        expect(states).toContain('interactive');
        expect(runtime.getMap()).toBe(mapState.getLastMap());
    });

    it('updates preset through raster source instead of rebuilding the map', async () => {
        const runtime = new BasemapRuntime();
        await runtime.initialize(document.createElement('div'));

        runtime.setPreset('satellite');

        const source = mapState.getLastMap().getSource('basemap');
        expect(source.setTiles).toHaveBeenCalledWith([
            'https://mt0.google.com/vt/lyrs=s&hl=vi&gl=vn&x={x}&y={y}&z={z}',
            'https://mt1.google.com/vt/lyrs=s&hl=vi&gl=vn&x={x}&y={y}&z={z}',
            'https://mt2.google.com/vt/lyrs=s&hl=vi&gl=vn&x={x}&y={y}&z={z}',
            'https://mt3.google.com/vt/lyrs=s&hl=vi&gl=vn&x={x}&y={y}&z={z}',
        ]);
        expect(source.reload).toHaveBeenCalled();
        expect(mapState.getInstances()).toBe(1);
    });

    it('cleans up idempotently', async () => {
        const runtime = new BasemapRuntime();
        await runtime.initialize(document.createElement('div'));
        const map = mapState.getLastMap();

        runtime.destroy();
        runtime.destroy();

        expect(map.remove).toHaveBeenCalledTimes(1);
        expect(runtime.getLifecycleState()).toBe('destroyed');
    });
});
