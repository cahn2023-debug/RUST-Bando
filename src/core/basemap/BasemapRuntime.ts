import maplibregl from 'maplibre-gl';
import { DEFAULT_BASEMAP_CAMERA, DEFAULT_BASEMAP_PREFERENCES } from './presets';
import { BASEMAP_SOURCE_ID, createBasemapStyle, getStyledBasemapTiles } from './style';
import type {
    BasemapController,
    BasemapLifecycleState,
    BasemapPresetId,
    BasemapRuntimeConfig,
    CameraSnapshot,
    CameraState,
    CameraTransitionOptions,
    FitBoundsOptions,
    GeographicBounds,
    Unsubscribe,
} from './types';

const identityMatrix = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const DEFAULT_CONFIG: BasemapRuntimeConfig = {
    initialCamera: DEFAULT_BASEMAP_CAMERA,
    initialPresetId: DEFAULT_BASEMAP_PREFERENCES.presetId,
    locale: DEFAULT_BASEMAP_PREFERENCES.locale,
    region: DEFAULT_BASEMAP_PREFERENCES.region,
    minZoom: 0,
    maxZoom: 23,
    maxPitch: 60,
    rotationEnabled: true,
    tileRequestTimeoutMs: 10000,
    fallbackPresetId: 'street',
    pixelRatioLimit: 3,
};

export class BasemapRuntime implements BasemapController {
    private map: maplibregl.Map | null = null;
    private config: BasemapRuntimeConfig = DEFAULT_CONFIG;
    private lifecycleState: BasemapLifecycleState = 'uninitialized';
    private cameraVersion = 0;
    private cameraSnapshot: CameraSnapshot = {
        ...DEFAULT_BASEMAP_CAMERA,
        matrix: identityMatrix(),
        width: 0,
        height: 0,
        pixelRatio: 1,
        version: 0,
    };
    private cameraListeners = new Set<(snapshot: CameraSnapshot) => void>();
    private lifecycleListeners = new Set<(state: BasemapLifecycleState) => void>();
    private resizeObserver: ResizeObserver | null = null;

    async initialize(container: HTMLElement, config: Partial<BasemapRuntimeConfig> = {}): Promise<void> {
        if (this.map) return;
        this.config = { ...DEFAULT_CONFIG, ...config, initialCamera: { ...DEFAULT_CONFIG.initialCamera, ...config.initialCamera } };
        this.setLifecycleState('mounting');
        this.setLifecycleState('surface-ready');

        const tileUrls = getStyledBasemapTiles(this.config.initialPresetId, {
            locale: this.config.locale,
            region: this.config.region,
        });
        const camera = this.config.initialCamera;
        let map: maplibregl.Map;
        try {
            map = new maplibregl.Map({
                container,
                style: createBasemapStyle(tileUrls),
                center: camera.center,
                zoom: camera.zoom,
                bearing: camera.bearing,
                pitch: camera.pitch,
                minZoom: this.config.minZoom,
                maxZoom: this.config.maxZoom,
                maxPitch: this.config.maxPitch,
                attributionControl: false,
                canvasContextAttributes: {
                    preserveDrawingBuffer: true,
                },
            });
        } catch (error) {
            this.setLifecycleState('failed');
            console.warn('[Basemap] maplibre-create-failed', error);
            return;
        }

        this.map = map;
        this.setLifecycleState('map-created');
        this.publishCamera();

        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(container);
        }

        map.once('render', () => {
            this.setLifecycleState('first-frame');
            this.setLifecycleState('interactive');
        });
        map.on('move', () => this.publishCamera());
        map.on('moveend', () => this.publishCamera());
        map.on('error', (event: any) => {
            const sourceId = event?.sourceId || event?.source?.id;
            if (!sourceId || sourceId === BASEMAP_SOURCE_ID) this.setLifecycleState('degraded');
        });
    }

    destroy(): void {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.map?.remove();
        this.map = null;
        this.setLifecycleState('destroyed');
    }

    resize(): void {
        this.map?.resize();
        this.publishCamera();
    }

    getLifecycleState(): BasemapLifecycleState {
        return this.lifecycleState;
    }

    getCamera(): CameraSnapshot {
        return {
            ...this.cameraSnapshot,
            matrix: new Float32Array(this.cameraSnapshot.matrix),
        };
    }

    getMap(): maplibregl.Map | null {
        return this.map;
    }

    setCamera(camera: Partial<CameraState>, options: CameraTransitionOptions = {}): void {
        if (!this.map) return;
        const target = {
            center: camera.center,
            zoom: camera.zoom,
            bearing: camera.bearing,
            pitch: camera.pitch,
            duration: options.duration,
        };
        if (options.animate) this.map.easeTo(target);
        else this.map.jumpTo(target);
        this.publishCamera();
    }

    fitBounds(bounds: GeographicBounds, options: FitBoundsOptions = {}): void {
        this.map?.fitBounds(bounds, {
            animate: options.animate ?? false,
            duration: options.duration,
            padding: options.padding,
            maxZoom: options.maxZoom,
        });
        this.publishCamera();
    }

    setPreset(presetId: BasemapPresetId): void {
        if (!this.map) {
            this.config = { ...this.config, initialPresetId: presetId };
            return;
        }
        const source = this.map.getSource(BASEMAP_SOURCE_ID) as { setTiles?: (tiles: string[]) => void; reload?: () => void } | undefined;
        source?.setTiles?.(getStyledBasemapTiles(presetId, {
            locale: this.config.locale,
            region: this.config.region,
        }));
        source?.reload?.();
    }

    setVisibility(visible: boolean): void {
        const container = this.map?.getContainer();
        if (container) container.style.visibility = visible ? 'visible' : 'hidden';
    }

    subscribeCamera(listener: (snapshot: CameraSnapshot) => void): Unsubscribe {
        this.cameraListeners.add(listener);
        listener(this.getCamera());
        return () => this.cameraListeners.delete(listener);
    }

    subscribeLifecycle(listener: (state: BasemapLifecycleState) => void): Unsubscribe {
        this.lifecycleListeners.add(listener);
        listener(this.lifecycleState);
        return () => this.lifecycleListeners.delete(listener);
    }

    private setLifecycleState(state: BasemapLifecycleState): void {
        this.lifecycleState = state;
        this.lifecycleListeners.forEach(listener => listener(state));
    }

    private publishCamera(matrix = identityMatrix()): void {
        const map = this.map;
        const canvas = map?.getCanvas();
        const center = map?.getCenter();
        this.cameraSnapshot = {
            matrix,
            center: center ? [center.lng, center.lat] : this.config.initialCamera.center,
            zoom: map?.getZoom() ?? this.config.initialCamera.zoom,
            bearing: map?.getBearing() ?? this.config.initialCamera.bearing,
            pitch: map?.getPitch() ?? this.config.initialCamera.pitch,
            width: canvas?.width ?? 0,
            height: canvas?.height ?? 0,
            pixelRatio: Math.min(window.devicePixelRatio || 1, this.config.pixelRatioLimit),
            version: ++this.cameraVersion,
        };
        const snapshot = this.getCamera();
        this.cameraListeners.forEach(listener => listener(snapshot));
    }
}

export function createBasemapRuntime(): BasemapRuntime {
    return new BasemapRuntime();
}
