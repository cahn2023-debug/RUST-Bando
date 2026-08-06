import maplibregl from 'maplibre-gl';
import { loadStoredPreferences, storePreferences } from './basemapStorage';
import { DEFAULT_BASEMAP_CAMERA, DEFAULT_BASEMAP_PREFERENCES } from './presets';
import { BASEMAP_SOURCE_ID, createBasemapStyle, getStyledBasemapTiles } from './style';
import { clearRetryQueue, clearSourceKey, deriveTileSourceKey, registerBasemapTileProtocol, toCachedTileUrls } from './tileCache';
import { registerTileServiceWorker } from './tileServiceWorker';
import { scheduleBasemapPrefetch } from './tilePrefetch';
import type {
    BasemapController,
    BasemapLifecycleState,
    BasemapPreferences,
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
    warmCacheOnLaunch: true,
};

export class BasemapRuntime implements BasemapController {
    private map: maplibregl.Map | null = null;
    private config: BasemapRuntimeConfig = DEFAULT_CONFIG;
    private lifecycleState: BasemapLifecycleState = 'uninitialized';
    private cameraVersion = 0;
    private presetId: BasemapPresetId = DEFAULT_BASEMAP_PREFERENCES.presetId;
    private preferences: BasemapPreferences = { ...DEFAULT_BASEMAP_PREFERENCES };
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
    private presetListeners = new Set<(presetId: BasemapPresetId, preferences: BasemapPreferences) => void>();
    private resizeObserver: ResizeObserver | null = null;
    private cancelPrefetch: (() => void) | null = null;
    private tileAbortController: AbortController | null = null;
    private recoveryAttempts = 0;
    private degradedAt: number | null = null;
    private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

    async initialize(container: HTMLElement, config: Partial<BasemapRuntimeConfig> = {}): Promise<void> {
        if (this.map) return;
        this.config = { ...DEFAULT_CONFIG, ...config, initialCamera: { ...DEFAULT_CONFIG.initialCamera, ...config.initialCamera } };
        const stored = loadStoredPreferences();
        // A stored choice wins over the config's initial values: the user's last
        // basemap is what they should see on relaunch. Missing fields fall back to
        // the config, then to defaults.
        this.presetId = stored?.presetId ?? this.config.initialPresetId;
        this.preferences = {
            ...DEFAULT_BASEMAP_PREFERENCES,
            ...(stored || {}),
            presetId: this.presetId,
            locale: stored?.locale ?? this.config.locale ?? DEFAULT_BASEMAP_PREFERENCES.locale,
            region: stored?.region ?? this.config.region ?? DEFAULT_BASEMAP_PREFERENCES.region,
        };
        this.setLifecycleState('mounting');
        this.setLifecycleState('surface-ready');

        await registerTileServiceWorker();
        registerBasemapTileProtocol({ timeoutMs: this.config.tileRequestTimeoutMs });

        const tileUrls = this.resolveTileUrls();
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
            // Warm the cache only once the map is drawing — the visible viewport
            // should win the race for bandwidth over the background pyramid.
            if (this.config.warmCacheOnLaunch && !this.cancelPrefetch) {
                this.cancelPrefetch = scheduleBasemapPrefetch({
                    presetId: this.presetId,
                    preferences: this.preferences,
                });
            }
        });
        map.on('move', () => this.publishCamera());
        map.on('moveend', () => this.publishCamera());
        map.on('error', (event: any) => this.handleMapError(event));
    }

    destroy(): void {
        this.cancelPrefetch?.();
        this.cancelPrefetch = null;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        if (this.recoveryTimer !== null) { clearTimeout(this.recoveryTimer); this.recoveryTimer = null; }
        this.tileAbortController?.abort();
        this.tileAbortController = null;
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

    /**
     * Tile URLs for the current preset, routed through the disk cache when one is
     * available. Every path that sets tiles goes through here, so the cache can
     * never be bypassed by only half the code.
     */
    private resolveTileUrls(): string[] {
        return toCachedTileUrls(this.presetId, getStyledBasemapTiles(this.presetId, this.preferences));
    }

    setPreset(presetId: BasemapPresetId, preferences: Partial<BasemapPreferences> = {}): void {
        // Cancel in-flight prefetch for old preset
        this.cancelPrefetch?.();
        this.cancelPrefetch = null;

        // Cancel in-flight tile requests (abort controller per preset epoch)
        this.tileAbortController?.abort();
        this.tileAbortController = new AbortController();

        // Clear stale source key and retry queue for the previous preset
        const previousKey = deriveTileSourceKey(this.presetId, getStyledBasemapTiles(this.presetId, this.preferences));
        clearSourceKey(previousKey);
        clearRetryQueue(previousKey);

        this.presetId = presetId;
        this.preferences = { ...this.preferences, ...preferences, presetId };

        if (!this.map) {
            this.config = { ...this.config, initialPresetId: presetId };
            storePreferences(this.getPreferences());
            this.emitPreset();
            return;
        }

        const applyPreset = () => {
            const source = this.map!.getSource(BASEMAP_SOURCE_ID) as { setTiles?: (t: string[]) => void } | undefined;
            source?.setTiles?.(this.resolveTileUrls());
            // ← NO source.reload() call here

            if (this.lifecycleState === 'degraded') this.setLifecycleState('interactive');
            storePreferences(this.getPreferences());
            this.emitPreset();

            this.cancelPrefetch = scheduleBasemapPrefetch({
                presetId: this.presetId,
                preferences: this.preferences,
            });
        };

        if (this.lifecycleState === 'interactive') {
            applyPreset();
        } else {
            this.map.once('render', applyPreset);
        }
    }

    getPresetId(): BasemapPresetId {
        return this.presetId;
    }

    getPreferences(): BasemapPreferences {
        return { ...this.preferences };
    }

    /**
     * Zoom by a relative step. Lives here rather than in the control component so
     * the min/max clamp stays with the runtime that owns the map.
     */
    zoomBy(delta: number): void {
        const map = this.map;
        if (!map) return;
        map.easeTo({ zoom: map.getZoom() + delta, duration: 200 });
    }

    subscribePreset(listener: (presetId: BasemapPresetId, preferences: BasemapPreferences) => void): Unsubscribe {
        this.presetListeners.add(listener);
        listener(this.presetId, this.getPreferences());
        return () => this.presetListeners.delete(listener);
    }

    private emitPreset(): void {
        const preferences = this.getPreferences();
        this.presetListeners.forEach(listener => listener(this.presetId, preferences));
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
        const prev = this.lifecycleState;
        this.lifecycleState = state;
        // Recovery completion log
        if (prev === 'degraded' && state === 'interactive' && this.degradedAt !== null) {
            console.info('[Basemap] lifecycle-recovered', {
                durationMs: Date.now() - this.degradedAt,
            });
            this.degradedAt = null;
            this.recoveryAttempts = 0;
        }
        // Synchronous notification — no setTimeout, no microtask
        this.lifecycleListeners.forEach(listener => listener(state));
    }

    private handleMapError(event: any): void {
        const sourceId = event?.sourceId || event?.source?.id;
        if (sourceId && sourceId !== BASEMAP_SOURCE_ID) return;

        const now = Date.now();
        if (this.lifecycleState !== 'degraded') {
            this.degradedAt = now;
            this.recoveryAttempts = 0;
        }
        this.setLifecycleState('degraded');
        this.scheduleRecovery();
    }

    private scheduleRecovery(): void {
        if (this.recoveryTimer !== null) return;
        this.recoveryTimer = setTimeout(() => {
            this.recoveryTimer = null;
            this.attemptRecovery();
        }, 3000);
    }

    private attemptRecovery(): void {
        if (!this.map) return;
        if (this.recoveryAttempts >= 3) {
            this.setLifecycleState('failed');
            console.error('[Basemap] recovery-failed', {
                attempts: this.recoveryAttempts,
                degradedAt: this.degradedAt,
            });
            return;
        }
        this.recoveryAttempts += 1;
        const source = this.map.getSource(BASEMAP_SOURCE_ID) as { reload?: () => void } | undefined;
        source?.reload?.();
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
