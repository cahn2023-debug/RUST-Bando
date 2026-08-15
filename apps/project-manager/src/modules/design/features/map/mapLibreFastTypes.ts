import type { FeatureState } from '@CONTRACT/types';

type Position = [number, number];

export type MapLibreFastGeometry =
    | { type: 'Point'; coordinates: Position }
    | { type: 'MultiPoint'; coordinates: Position[] }
    | { type: 'LineString'; coordinates: Position[] }
    | { type: 'MultiLineString'; coordinates: Position[][] }
    | { type: 'Polygon'; coordinates: Position[][] }
    | { type: 'MultiPolygon'; coordinates: Position[][][] };

export interface MapLibreFastFeature<TGeometry = MapLibreFastGeometry, TProperties = Record<string, unknown>> {
    type: 'Feature';
    geometry: TGeometry;
    properties: TProperties;
}

export interface MapLibreFastFeatureCollection<TGeometry = MapLibreFastGeometry, TProperties = Record<string, unknown>> {
    type: 'FeatureCollection';
    features: Array<MapLibreFastFeature<TGeometry, TProperties>>;
}

export type MapLibreLodLevel = 'full' | 'detail' | 'summary';

export interface MapLibreLodPolicyInput {
    zoom: number;
    featureCount: number;
    selectedFeatureId?: string | null;
}

export interface MapLibreLodPolicy {
    level: MapLibreLodLevel;
    maxFeatures: number;
    showLabels: boolean;
    clusterPoints: boolean;
    simplifyVectors: boolean;
}

export interface MapLibreRenderFeatureProperties {
    id: string;
    parentFeatureId?: string;
    groupId: string | null;
    layerId: string;
    name: string;
    geomType: string;
    color: string;
    size: number;
    selected: boolean;
    iconKey?: string;
    objectType?: string;
    isCamera?: boolean;
    isIntersection?: boolean;
    isIntersectionChild?: boolean;
    rotation?: number;
    displaySize?: number;
    labelIndex?: string;
    iconImageId?: string;
    dashArray?: number[];
}

export type MapLibreRenderFeature = MapLibreFastFeature<MapLibreFastGeometry, MapLibreRenderFeatureProperties>;
export type MapLibreRenderFeatureCollection = MapLibreFastFeatureCollection<MapLibreFastGeometry, MapLibreRenderFeatureProperties>;

export type MapLibrePreviewMetadata = { id: string; metadata: any; name?: string };
export type MapLibreGroupThemePreview = { groupId: string; config: Record<string, any> };

export interface BuildMapLibreFeatureCollectionInput {
    features: FeatureState[];
    selectedFeatureId?: string | null;
    focusIds?: Set<string>;
    hiddenIds?: Set<string>;
    zoom: number;
    featureGroups?: Record<string, any>;
    featureNumberMap?: Record<string, string | number>;
    groupThemePreview?: MapLibreGroupThemePreview | null;
    previewMetadata?: MapLibrePreviewMetadata | null;
    previewMetadataById?: Record<string, MapLibrePreviewMetadata>;
}
