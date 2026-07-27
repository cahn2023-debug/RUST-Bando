import type { FeatureState } from '@CONTRACT/types';
import type {
    BuildMapLibreFeatureCollectionInput,
    MapLibreLodPolicy,
    MapLibreLodPolicyInput,
    MapLibreRenderFeature,
    MapLibreRenderFeatureCollection,
} from './mapLibreFastTypes';
import { getParsedCoordinates } from '@TOOL/utils/featureUtils';

const SUMMARY_FEATURE_LIMIT = 1800;
const DETAIL_FEATURE_LIMIT = 6000;
const FULL_FEATURE_LIMIT = 14000;

const DEFAULT_COLOR = '#10b981';
const SELECTED_COLOR = '#22d3ee';

const parseObject = (value: unknown): Record<string, any> => {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
};

const styleValue = (feature: FeatureState, key: string) => {
    const metadata = parseObject(feature.metadata);
    const properties = parseObject(feature.properties);
    const gis = parseObject(metadata.gis);
    return gis[key] ?? metadata[key] ?? properties[key];
};

const asColor = (value: unknown) => {
    return typeof value === 'string' && value.trim().startsWith('#') ? value.trim() : null;
};

const asSize = (value: unknown) => {
    const size = Number(value);
    return Number.isFinite(size) && size > 0 ? Math.min(size, 48) : 8;
};

export const getMapLibreLodPolicy = ({
    zoom,
    featureCount,
}: MapLibreLodPolicyInput): MapLibreLodPolicy => {
    if (zoom < 15 || featureCount > DETAIL_FEATURE_LIMIT) {
        return {
            level: 'summary',
            maxFeatures: SUMMARY_FEATURE_LIMIT,
            showLabels: false,
            clusterPoints: true,
            simplifyVectors: true,
        };
    }

    if (zoom < 19 || featureCount > FULL_FEATURE_LIMIT) {
        return {
            level: 'detail',
            maxFeatures: DETAIL_FEATURE_LIMIT,
            showLabels: zoom >= 17,
            clusterPoints: false,
            simplifyVectors: true,
        };
    }

    return {
        level: 'full',
        maxFeatures: FULL_FEATURE_LIMIT,
        showLabels: true,
        clusterPoints: false,
        simplifyVectors: false,
    };
};

const normalizePoint = (coordinates: any): [number, number] | null => {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
};

const normalizeLine = (coordinates: any): [number, number][] | null => {
    if (!Array.isArray(coordinates)) return null;
    const points = coordinates
        .map(normalizePoint)
        .filter(Boolean) as [number, number][];
    return points.length >= 2 ? points : null;
};

const normalizePolygon = (coordinates: any): [number, number][][] | null => {
    if (!Array.isArray(coordinates)) return null;
    const rings = Array.isArray(coordinates[0]?.[0]) ? coordinates : [coordinates];
    const normalized = rings
        .map(normalizeLine)
        .filter(Boolean) as [number, number][][];
    return normalized.length > 0 ? normalized : null;
};

const toRenderFeature = (
    feature: FeatureState,
    selectedFeatureId: string | null | undefined
): MapLibreRenderFeature | null => {
    const geomType = String(feature.geom_type || 'Point').toLowerCase();
    const coordinates = getParsedCoordinates(feature);
    const selected = feature.id === selectedFeatureId;
    const color = selected ? SELECTED_COLOR : (asColor(styleValue(feature, 'color')) || DEFAULT_COLOR);
    const size = selected ? Math.max(asSize(styleValue(feature, 'size')), 12) : asSize(styleValue(feature, 'size'));

    if (geomType === 'point' || geomType === '' || geomType === 'default') {
        const point = normalizePoint(coordinates);
        if (!point) return null;
        return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: point },
            properties: {
                id: feature.id,
                groupId: feature.group_id,
                layerId: feature.layer_id,
                name: feature.name,
                geomType: 'point',
                color,
                size,
                selected,
            },
        };
    }

    if (geomType === 'linestring' || geomType === 'polyline' || geomType === 'line') {
        const line = normalizeLine(coordinates);
        if (!line) return null;
        return {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: line },
            properties: {
                id: feature.id,
                groupId: feature.group_id,
                layerId: feature.layer_id,
                name: feature.name,
                geomType: 'line',
                color,
                size: Math.max(size, selected ? 6 : 3),
                selected,
            },
        };
    }

    if (geomType === 'polygon') {
        const polygon = normalizePolygon(coordinates);
        if (!polygon) return null;
        return {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: polygon },
            properties: {
                id: feature.id,
                groupId: feature.group_id,
                layerId: feature.layer_id,
                name: feature.name,
                geomType: 'polygon',
                color,
                size,
                selected,
            },
        };
    }

    return null;
};

export const buildMapLibreFeatureCollection = ({
    features,
    selectedFeatureId,
    hiddenIds = new Set<string>(),
    zoom,
}: BuildMapLibreFeatureCollectionInput): {
    collection: MapLibreRenderFeatureCollection;
    lodPolicy: MapLibreLodPolicy;
} => {
    const lodPolicy = getMapLibreLodPolicy({ zoom, featureCount: features.length, selectedFeatureId });
    const selected = selectedFeatureId ? features.find(feature => feature.id === selectedFeatureId) : null;
    const selectedRenderFeature = selected ? toRenderFeature(selected, selectedFeatureId) : null;
    const renderFeatures: MapLibreRenderFeature[] = [];

    for (const feature of features) {
        if (renderFeatures.length >= lodPolicy.maxFeatures) break;
        if (feature.id === selectedFeatureId) continue;
        if (hiddenIds.has(feature.id)) continue;
        if (feature.group_id && hiddenIds.has(feature.group_id)) continue;
        if (feature.layer_id && hiddenIds.has(feature.layer_id)) continue;

        const renderFeature = toRenderFeature(feature, selectedFeatureId);
        if (renderFeature) renderFeatures.push(renderFeature);
    }

    if (selectedRenderFeature) renderFeatures.unshift(selectedRenderFeature);

    return {
        collection: {
            type: 'FeatureCollection',
            features: renderFeatures,
        },
        lodPolicy,
    };
};
