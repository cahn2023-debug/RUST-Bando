import type { FeatureState } from '@CONTRACT/types';

export type OverlayDomain =
    | 'design'
    | 'fov'
    | 'dori'
    | 'measure'
    | 'edit'
    | 'drawing'
    | 'snap';

export interface MapRenderFlags {
    overlayEnabled: boolean;
    overlayPoints: boolean;
    overlayLines: boolean;
    overlayPolygons: boolean;
    overlayIcons: boolean;
    overlayLabels: boolean;
    overlayEditing: boolean;
}

export const DEFAULT_MAP_RENDER_FLAGS: MapRenderFlags = {
    overlayEnabled: true,
    overlayPoints: false,
    overlayLines: false,
    overlayPolygons: false,
    overlayIcons: false,
    overlayLabels: false,
    overlayEditing: false,
};

export const resolveMapRenderFlags = (
    input?: Partial<MapRenderFlags> | null
): MapRenderFlags => ({
    ...DEFAULT_MAP_RENDER_FLAGS,
    ...(input || {}),
});

export interface CameraSnapshot {
    matrix: Float32Array;
    width: number;
    height: number;
    pixelRatio: number;
    version: number;
}

export enum DirtyFlag {
    None = 0,
    Camera = 1 << 0,
    Geometry = 1 << 1,
    Style = 1 << 2,
    State = 1 << 3,
    Labels = 1 << 4,
    Resize = 1 << 5,
}

export interface GpuAllocation {
    bufferId: string;
    byteOffset: number;
    byteLength: number;
    vertexOffset: number;
    vertexCount: number;
}

export interface RenderFeatureRecord {
    id: number;
    sourceId: string;
    geometryVersion: number;
    styleBucketId: number;
    geometryType: 'point' | 'line' | 'polygon';
    domain: OverlayDomain;
    bbox: [number, number, number, number];
    gpuAllocation: GpuAllocation | null;
}

export interface FeatureStyleChange {
    id: string;
    styleBucketId?: number;
    color?: string;
    size?: number;
}

export interface FeatureStateChange {
    id: string;
    hovered?: boolean;
    selected?: boolean;
    locked?: boolean;
    warning?: boolean;
    hidden?: boolean;
}

export interface FeatureChangeSet {
    added: FeatureState[];
    updatedGeometry: FeatureState[];
    updatedStyle: FeatureStyleChange[];
    updatedState: FeatureStateChange[];
    deletedIds: string[];
}

export const emptyFeatureChangeSet = (): FeatureChangeSet => ({
    added: [],
    updatedGeometry: [],
    updatedStyle: [],
    updatedState: [],
    deletedIds: [],
});
