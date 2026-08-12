import type maplibregl from 'maplibre-gl';
import type { BasemapLayerVisibility } from './basemapLayers';

export type PreviewSourceMode = 'online' | 'offline';
export type PreviewLayerId = 'google-street' | 'google-hybrid' | 'local-package';
export type PreviewStyleId = 'engineering' | 'light' | 'dark';

export type PreviewLayerVisibilityKey = 'googleStreet' | 'googleHybrid' | 'localPackage';

export type PreviewLayerVisibilityState = Record<PreviewLayerVisibilityKey, BasemapLayerVisibility>;

/** @deprecated Use BasemapLayerVisibility; retained for existing controller callers. */
export interface SubLayerConfig {
    bordersLabels: boolean;
    roads: boolean;
    pois: boolean;
    buildings3d: boolean;
    terrain: boolean;
}

export const DEFAULT_LAYER_VISIBILITY: BasemapLayerVisibility = {
    landcover: true,
    water: true,
    boundaries: true,
    roads: true,
    labels: true,
    pois: true,
    buildings: true,
    terrain: true,
};

export const DEFAULT_LAYER_VISIBILITY_STATE: PreviewLayerVisibilityState = {
    googleStreet: { ...DEFAULT_LAYER_VISIBILITY },
    googleHybrid: { ...DEFAULT_LAYER_VISIBILITY },
    localPackage: { ...DEFAULT_LAYER_VISIBILITY },
};

export interface PreviewUserConfig {
    layer: PreviewLayerId;
    packageRoot: string | null;
    downloadUrl: string;
    downloadDirectory: string | null;
    watcherFolder: string | null;
    httpPort: number;
    autoZoom: boolean;
    layerVisibility: PreviewLayerVisibilityState;
}

export interface PreviewStyleReference {
    id: string;
    label: string;
    path: string;
}

export interface PreviewManifest {
    id: string;
    name: string;
    version: string;
    contractVersion: string;
    schemaVersion: string;
    defaultStyle: string;
    styles: PreviewStyleReference[];
    assets: {
        tileArchive: string;
        fonts: string[];
        sprites: string[];
    };
    attribution: string;
}

export interface PreviewSourceMetadata {
    mode: PreviewSourceMode;
    name: string;
    version: string;
    attribution: string;
    external: boolean;
}

export interface PreviewTileError {
    message: string;
    source: string;
}

export interface PreviewSourceAdapter {
    readonly metadata: PreviewSourceMetadata;
    readonly manifest: PreviewManifest | null;
    styleDocument(styleId: PreviewStyleId): Promise<maplibregl.StyleSpecification>;
    recordTileError(error: unknown): void;
    getTileError(): PreviewTileError | null;
}

export interface PreviewFileReader {
    read(path: string): Promise<Uint8Array>;
    readRange?(path: string, offset: number, length: number): Promise<Uint8Array>;
}

export const PREVIEW_STYLES: readonly PreviewStyleId[] = ['engineering', 'light', 'dark'];
