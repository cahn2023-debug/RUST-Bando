import type maplibregl from 'maplibre-gl';

export type BasemapPresetId = 'street' | 'satellite' | 'heat' | 'dark';
export type BasemapPresetKind = 'raster' | 'heat';

export interface CameraState {
    center: [number, number];
    zoom: number;
    bearing: number;
    pitch: number;
}

export interface CameraSnapshot extends CameraState {
    matrix: Float32Array;
    width: number;
    height: number;
    pixelRatio: number;
    version: number;
}

export type BasemapLifecycleState =
    | 'uninitialized'
    | 'mounting'
    | 'surface-ready'
    | 'map-created'
    | 'first-frame'
    | 'tiles-loading'
    | 'interactive'
    | 'degraded'
    | 'failed'
    | 'destroyed';

export interface BasemapPreset {
    id: BasemapPresetId;
    label: string;
    title: string;
    kind: BasemapPresetKind;
    tileLyr: 'm' | 's';
    tileUrls: string[];
    supportsApiStyle: boolean;
    apiStyleRules?: readonly string[];
    minZoom: number;
    maxZoom: number;
    attribution?: string;
}

export interface BasemapPreferences {
    presetId: BasemapPresetId;
    roads: boolean;
    roadNames: boolean;
    buildings: boolean;
    pois: boolean;
    labels: boolean;
    locale: string;
    region: string;
}

export interface BasemapRuntimeConfig {
    initialCamera: CameraState;
    initialPresetId: BasemapPresetId;
    locale: string;
    region: string;
    minZoom: number;
    maxZoom: number;
    maxPitch: number;
    rotationEnabled: boolean;
    tileRequestTimeoutMs: number;
    fallbackPresetId?: BasemapPresetId;
    pixelRatioLimit: number;
}

export interface CameraTransitionOptions {
    animate?: boolean;
    duration?: number;
}

export interface FitBoundsOptions extends CameraTransitionOptions {
    padding?: number;
    maxZoom?: number;
}

export type GeographicBounds = [[number, number], [number, number]];
export type Unsubscribe = () => void;

export interface BasemapController {
    initialize(container: HTMLElement, config?: Partial<BasemapRuntimeConfig>): Promise<void>;
    destroy(): void;
    resize(): void;
    getLifecycleState(): BasemapLifecycleState;
    getCamera(): CameraSnapshot;
    getMap(): maplibregl.Map | null;
    setCamera(camera: Partial<CameraState>, options?: CameraTransitionOptions): void;
    fitBounds(bounds: GeographicBounds, options?: FitBoundsOptions): void;
    setPreset(presetId: BasemapPresetId, preferences?: Partial<BasemapPreferences>): void;
    setVisibility(visible: boolean): void;
    subscribeCamera(listener: (snapshot: CameraSnapshot) => void): Unsubscribe;
    subscribeLifecycle(listener: (state: BasemapLifecycleState) => void): Unsubscribe;
}
