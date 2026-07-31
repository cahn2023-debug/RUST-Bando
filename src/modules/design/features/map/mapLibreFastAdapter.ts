import type { FeatureState } from '@CONTRACT/types';
import type {
    BuildMapLibreFeatureCollectionInput,
    MapLibreLodPolicy,
    MapLibreLodPolicyInput,
    MapLibreRenderFeature,
    MapLibreRenderFeatureCollection,
} from './mapLibreFastTypes';
import { getParsedCoordinates } from '@TOOL/utils/featureUtils';
import { getFeatureDisplayInfo, isCameraIcon } from '@TOOL/utils/featureDisplay';
import { getFeatureMetadataValue, getParsedMetadata } from '@TOOL/utils/featureMetadata';

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

const getFeatureMetadataWithGroupPreview = (
    feature: FeatureState,
    groupThemePreview?: Record<string, any> | null
) => {
    const metadata = getParsedMetadata(feature);
    const groupPreview = groupThemePreview && feature.group_id
        ? (groupThemePreview[feature.group_id] || {})
        : {};
    return {
        ...metadata,
        ...groupPreview,
        gis: {
            ...(metadata.gis || {}),
            ...(groupPreview.gis || {}),
        },
        infrastructure: {
            ...(metadata.infrastructure || {}),
            ...(groupPreview.infrastructure || {}),
        },
        fiber: {
            ...(metadata.fiber || {}),
            ...(groupPreview.fiber || {}),
        },
    };
};

const styleValueFromMetadata = (feature: FeatureState, metadata: Record<string, any>, key: string) => {
    const properties = parseObject(feature.properties);
    const gis = parseObject(metadata.gis);
    return gis[key] ?? metadata[key] ?? properties[key];
};

const asColor = (value: unknown) => {
    return typeof value === 'string' && value.trim().startsWith('#') ? value.trim() : null;
};

const asSize = (value: unknown) => {
    const size = Number(value);
    return Number.isFinite(size) && size > 0 ? Math.min(size, 100) : 8;
};

const asRotation = (value: unknown) => {
    const rotation = Number(value);
    return Number.isFinite(rotation) ? rotation : 0;
};

const asDashArray = (value: unknown): number[] | undefined => {
    if (Array.isArray(value)) {
        const parsed = value.map(Number).filter(item => Number.isFinite(item) && item > 0);
        return parsed.length >= 2 ? parsed : undefined;
    }
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const parsed = value.split(/[,\s]+/).map(Number).filter(item => Number.isFinite(item) && item > 0);
    return parsed.length >= 2 ? parsed : undefined;
};

const imageIdSafe = (value: unknown) => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');

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
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
        const lng = Number(coordinates[0]);
        const lat = Number(coordinates[1]);
        return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
    }
    if (coordinates && typeof coordinates === 'object' && !Array.isArray(coordinates)) {
        const lng = Number(coordinates.lng ?? coordinates.x ?? coordinates.Longitude ?? coordinates.longitude);
        const lat = Number(coordinates.lat ?? coordinates.y ?? coordinates.Latitude ?? coordinates.latitude);
        return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
    }
    return null;
};

const normalizeLine = (coordinates: any): [number, number][] | null => {
    if (!Array.isArray(coordinates)) {
        if (coordinates && typeof coordinates === 'object') {
            coordinates = coordinates.points || coordinates.coordinates || coordinates.coords || coordinates;
        }
    }
    if (!Array.isArray(coordinates)) return null;
    const points = coordinates
        .map(normalizePoint)
        .filter(Boolean) as [number, number][];
    return points.length >= 2 ? points : null;
};

const normalizePolygon = (coordinates: any): [number, number][][] | null => {
    if (!Array.isArray(coordinates)) {
        if (coordinates && typeof coordinates === 'object') {
            coordinates = coordinates.points || coordinates.coordinates || coordinates.coords || coordinates;
        }
    }
    if (!Array.isArray(coordinates)) return null;
    
    const first = coordinates[0];
    if (!first) return null;

    let isSingleRing = false;
    if (Array.isArray(first)) {
        if (first.length >= 2 && typeof first[0] === 'number') {
            isSingleRing = true;
        }
    } else if (typeof first === 'object') {
        isSingleRing = true;
    }

    const rings = isSingleRing ? [coordinates] : coordinates;
    const normalized = rings
        .map(normalizeLine)
        .filter(Boolean) as [number, number][][];
    return normalized.length > 0 ? normalized : null;
};

const toRenderFeature = (
    feature: FeatureState,
    selectedFeatureId: string | null | undefined,
    featureGroups: Record<string, any>,
    featureNumberMap: Record<string, string | number>,
    groupThemePreview?: Record<string, any> | null
): MapLibreRenderFeature | null => {
    const geomType = String(feature.geom_type || 'Point').toLowerCase();
    const coordinates = getParsedCoordinates(feature);
    const selected = feature.id === selectedFeatureId;
    const metadata = getFeatureMetadataWithGroupPreview(feature, groupThemePreview);
    const color = selected ? SELECTED_COLOR : (asColor(styleValueFromMetadata(feature, metadata, 'color')) || DEFAULT_COLOR);
    const size = selected ? Math.max(asSize(styleValueFromMetadata(feature, metadata, 'size')), 12) : asSize(styleValueFromMetadata(feature, metadata, 'size'));

    if (geomType === 'point' || geomType === '' || geomType === 'default') {
        const point = normalizePoint(coordinates);
        if (!point) return null;
        const group = feature.group_id ? featureGroups[feature.group_id] : null;
        const displayInfo = getFeatureDisplayInfo(feature, group?.type, group?.name, metadata);
        const rawDisplaySize = metadata.gis?.size ?? metadata.size ?? feature?.properties?.size ?? size;
        const baseDisplaySize = asSize(rawDisplaySize);
        const displaySize = displayInfo.isIntersection || displayInfo.isCamera
            ? Math.floor(baseDisplaySize * 1.5)
            : baseDisplaySize;
        const rotation = asRotation(getFeatureMetadataValue(feature, 'gis.rotation', 'rotation', metadata));
        const labelIndex = String(featureNumberMap[feature.id] || '1');
        const pointIconKey = isCameraIcon(displayInfo.iconKey) ? displayInfo.iconKey : (
            displayInfo.isIntersection ? 'intersection' : (displayInfo.iconKey || 'default')
        );
        const hasPointIcon = Boolean(pointIconKey && pointIconKey !== 'default' && pointIconKey !== 'point_circle');
        const iconImageId = hasPointIcon
            ? [
                'design-point',
                imageIdSafe(pointIconKey),
                imageIdSafe(displayInfo.color || color),
                imageIdSafe(displaySize),
                imageIdSafe(labelIndex),
                imageIdSafe(rotation),
            ].join('-')
            : '';
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
                iconKey: pointIconKey,
                objectType: displayInfo.objectType,
                isCamera: displayInfo.isCamera,
                isIntersection: displayInfo.isIntersection,
                rotation,
                displaySize,
                labelIndex,
                iconImageId,
            },
        };
    }

    if (geomType === 'linestring' || geomType === 'polyline' || geomType === 'line') {
        const line = normalizeLine(coordinates);
        if (!line) return null;
        const dashArray = asDashArray(metadata.gis?.dashArray ?? metadata.dashArray);
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
                dashArray,
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
    featureGroups: featureGroupsInput = {},
    featureNumberMap = {},
    groupThemePreview = null,
}: BuildMapLibreFeatureCollectionInput): {
    collection: MapLibreRenderFeatureCollection;
    lodPolicy: MapLibreLodPolicy;
} => {
    const lodPolicy = getMapLibreLodPolicy({ zoom, featureCount: features.length, selectedFeatureId });
    const selected = selectedFeatureId ? features.find(feature => feature.id === selectedFeatureId) : null;
    const featureGroups = featureGroupsInput || {};
    const selectedRenderFeature = selected ? toRenderFeature(selected, selectedFeatureId, featureGroups, featureNumberMap || {}, groupThemePreview) : null;
    const renderFeatures: MapLibreRenderFeature[] = [];

    for (const feature of features) {
        if (renderFeatures.length >= lodPolicy.maxFeatures) break;
        if (feature.id === selectedFeatureId) continue;
        if (hiddenIds.has(feature.id)) continue;
        if (feature.group_id && hiddenIds.has(feature.group_id)) continue;
        if (feature.layer_id && hiddenIds.has(feature.layer_id)) continue;

        const renderFeature = toRenderFeature(feature, selectedFeatureId, featureGroups, featureNumberMap || {}, groupThemePreview);
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
