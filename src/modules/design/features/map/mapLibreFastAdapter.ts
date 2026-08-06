import type { FeatureState } from '@CONTRACT/types';
import type {
    BuildMapLibreFeatureCollectionInput,
    MapLibreLodPolicy,
    MapLibreLodPolicyInput,
    MapLibreRenderFeature,
    MapLibreRenderFeatureCollection,
    MapLibreRenderFeatureProperties,
} from './mapLibreFastTypes';
import { getCoordinates } from './coordinateCache';
import { getParsedCoordinates } from '@TOOL/utils/featureUtils';
import { getFeatureDisplayInfo, isCameraIcon } from '@TOOL/utils/featureDisplay';
import { getFeatureMetadataValue, getParsedMetadata } from '@TOOL/utils/featureMetadata';
import { MAP_POINT_CLUSTER_HIDE_AT_ZOOM, MAP_INTERSECTION_CHILD_MIN_ZOOM, isMapIntersectionChild } from './mapDisplayPolicy';

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
    let val = gis[key] ?? metadata[key] ?? properties[key];
    if (val === undefined && key === 'size') {
        val = gis.stroke ?? metadata.stroke ?? properties.stroke
            ?? gis.weight ?? metadata.weight ?? properties.weight
            ?? gis.line_width ?? metadata.line_width ?? properties.line_width;
    }
    return val;
};

const asColor = (value: unknown) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('rgb') || trimmed.startsWith('hsl') || /^[a-z]+$/i.test(trimmed)) {
        return trimmed;
    }
    return null;
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

const isLineGeomType = (feature: FeatureState, metadata: Record<string, any>): boolean => {
    const geomType = String(feature.geom_type || '').trim().toLowerCase();

    // 1. Explicit line geom_types
    if (geomType === 'linestring' || geomType === 'polyline' || geomType === 'line' || geomType === 'signalline' || geomType === 'networklink') {
        return true;
    }
    if (geomType.includes('line') || geomType.includes('polyline') || geomType.includes('cable') || geomType.includes('tuyen') || geomType.includes('route') || geomType.includes('network') || geomType.includes('multiline')) {
        return true;
    }

    // 2. Metadata / Infrastructure type indicates a line
    const infraType = String(metadata?.infrastructure?.type || metadata?.type || '').toLowerCase();
    if (infraType === 'signalline' || infraType === 'networklink' || infraType.includes('line') || infraType.includes('route') || infraType.includes('network') || infraType.includes('multiline')) {
        return true;
    }

    // 3. Polygon types are not lines
    if (geomType === 'polygon' || geomType === 'multipolygon') {
        return false;
    }

    // 4. Coordinates parse to 2 or more valid points
    const lineCoords = normalizeLine(getParsedCoordinates(feature));
    if (lineCoords && lineCoords.length >= 2) {
        return true;
    }

    return false;
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
            clusterPoints: zoom < MAP_POINT_CLUSTER_HIDE_AT_ZOOM,
            simplifyVectors: true,
        };
    }

    if (zoom < 19 || featureCount > FULL_FEATURE_LIMIT) {
        return {
            level: 'detail',
            maxFeatures: DETAIL_FEATURE_LIMIT,
            showLabels: zoom >= 17,
            clusterPoints: zoom < MAP_POINT_CLUSTER_HIDE_AT_ZOOM,
            simplifyVectors: true,
        };
    }

    return {
        level: 'full',
        maxFeatures: FULL_FEATURE_LIMIT,
        showLabels: true,
        clusterPoints: zoom < MAP_POINT_CLUSTER_HIDE_AT_ZOOM,
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

type RenderableGeometry = MapLibreRenderFeature['geometry'];

const geometryInputForFeature = (feature: FeatureState) => {
    const rawCoordinates = getCoordinates(feature.id, (feature as any).coordinates);
    if (rawCoordinates && typeof rawCoordinates === 'object' && !Array.isArray(rawCoordinates)) {
        const rawType = (rawCoordinates as any).type;
        if (typeof rawType === 'string') return rawCoordinates as { type: string; coordinates?: unknown; geometries?: unknown[] };
    }
    return {
        type: String(feature.geom_type || 'Point'),
        coordinates: getParsedCoordinates(feature),
    };
};

const normalizeMultiPoint = (coordinates: any): [number, number][] | null => {
    if (!Array.isArray(coordinates)) return null;
    const points = coordinates.map(normalizePoint).filter(Boolean) as [number, number][];
    return points.length > 0 ? points : null;
};

const normalizeMultiLine = (coordinates: any): [number, number][][] | null => {
    if (!Array.isArray(coordinates)) return null;
    const lines = coordinates.map(normalizeLine).filter(Boolean) as [number, number][][];
    return lines.length > 0 ? lines : null;
};

const normalizeMultiPolygon = (coordinates: any): [number, number][][][] | null => {
    if (!Array.isArray(coordinates)) return null;
    const polygons = coordinates.map(normalizePolygon).filter(Boolean) as [number, number][][][];
    return polygons.length > 0 ? polygons : null;
};

const normalizeRenderableGeometry = (
    type: string,
    coordinates: unknown,
    isLine: boolean
): RenderableGeometry | null => {
    const geomType = type.trim().toLowerCase();
    if (!isLine && (geomType === 'point' || geomType === '' || geomType === 'default')) {
        const point = normalizePoint(coordinates);
        return point ? { type: 'Point', coordinates: point } : null;
    }
    if (geomType === 'multipoint') {
        const points = normalizeMultiPoint(coordinates);
        return points ? { type: 'MultiPoint', coordinates: points } : null;
    }
    if (geomType === 'multilinestring') {
        const lines = normalizeMultiLine(coordinates);
        return lines ? { type: 'MultiLineString', coordinates: lines } : null;
    }
    if (geomType === 'multipolygon') {
        const polygon = normalizeMultiPolygon(coordinates);
        return polygon ? { type: 'MultiPolygon', coordinates: polygon } : null;
    }
    if (isLine || geomType === 'linestring' || geomType === 'polyline' || geomType === 'line') {
        const line = normalizeLine(coordinates);
        return line ? { type: 'LineString', coordinates: line } : null;
    }
    if (geomType === 'polygon') {
        const polygon = normalizePolygon(coordinates);
        return polygon ? { type: 'Polygon', coordinates: polygon } : null;
    }
    return null;
};

const renderGeomType = (geometry: RenderableGeometry) => {
    if (geometry.type === 'Point' || geometry.type === 'MultiPoint') return 'point';
    if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') return 'line';
    return 'polygon';
};

const toRenderFeatures = (
    feature: FeatureState,
    selectedFeatureId: string | null | undefined,
    featureGroups: Record<string, any>,
    featureNumberMap: Record<string, string | number>,
    groupThemePreview?: Record<string, any> | null,
    childPath: string[] = []
): MapLibreRenderFeature[] => {
    const geometryInput = geometryInputForFeature(feature);
    const geomType = String(geometryInput.type || feature.geom_type || 'Point').toLowerCase();
    const selected = feature.id === selectedFeatureId;
    const metadata = getFeatureMetadataWithGroupPreview(feature, groupThemePreview);
    const color = selected ? SELECTED_COLOR : (asColor(styleValueFromMetadata(feature, metadata, 'color')) || DEFAULT_COLOR);
    const size = selected ? Math.max(asSize(styleValueFromMetadata(feature, metadata, 'size')), 12) : asSize(styleValueFromMetadata(feature, metadata, 'size'));
    const isLine = isLineGeomType(feature, metadata);
    const childId = childPath.length > 0 ? `${feature.id}::${childPath.join('.')}` : feature.id;
    const parentFeatureId = childPath.length > 0 ? feature.id : undefined;

    if (geomType === 'geometrycollection') {
        const geometries = Array.isArray((geometryInput as any).geometries) ? (geometryInput as any).geometries : [];
        return geometries.flatMap((geometry: any, index: number) => {
            const childFeature = {
                ...feature,
                geom_type: String(geometry?.type || ''),
                coordinates: geometry,
            } as FeatureState;
            const children = toRenderFeatures(childFeature, selectedFeatureId, featureGroups, featureNumberMap, groupThemePreview, [...childPath, `g${index}`]);
            if (children.length === 0) {
                console.warn('[mapLibreFastAdapter] Skipped invalid GeometryCollection child:', feature.id, index);
            }
            return children;
        });
    }

    const geometry = normalizeRenderableGeometry(geomType, (geometryInput as any).coordinates, isLine);
    if (!geometry) {
        console.warn('[mapLibreFastAdapter] Skipped invalid geometry:', feature.id, geomType);
        return [];
    }

    const kind = renderGeomType(geometry);
    if (kind === 'point') {
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
        const isIntersectionChild = isMapIntersectionChild(feature, group, metadata, displayInfo);
        return [{
            type: 'Feature',
            geometry,
            properties: {
                id: childId,
                parentFeatureId,
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
                isIntersectionChild,
                rotation,
                displaySize,
                labelIndex,
                iconImageId,
            },
        }];
    }

    if (kind === 'line') {
        const dashArray = asDashArray(metadata.gis?.dashArray ?? metadata.dashArray);
        const lineProps: MapLibreRenderFeatureProperties = {
            id: childId,
            parentFeatureId,
            groupId: feature.group_id,
            layerId: feature.layer_id,
            name: feature.name,
            geomType: 'line',
            color: color || DEFAULT_COLOR,
            size: Math.max(size || 3, selected ? 6 : 3),
            selected,
        };
        if (dashArray && dashArray.length >= 2) {
            lineProps.dashArray = dashArray;
        }
        return [{
            type: 'Feature',
            geometry,
            properties: lineProps,
        }];
    }

    return [{
        type: 'Feature',
        geometry,
        properties: {
            id: childId,
            parentFeatureId,
            groupId: feature.group_id,
            layerId: feature.layer_id,
            name: feature.name,
            geomType: 'polygon',
            color,
            size,
            selected,
        },
    }];
};

export const buildMapLibreFeatureCollection = ({
    features,
    selectedFeatureId,
    focusIds,
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
    const canRenderFeature = (feature: FeatureState) => {
        if (focusIds && focusIds.size > 0 && !focusIds.has(feature.id)) return false;
        if (hiddenIds.has(feature.id)) return false;
        if (feature.group_id && hiddenIds.has(feature.group_id)) return false;
        if (feature.layer_id && hiddenIds.has(feature.layer_id)) return false;

        const metadata = getFeatureMetadataWithGroupPreview(feature, groupThemePreview);
        const isLine = isLineGeomType(feature, metadata);
        const geomTypeLower = String(feature.geom_type || '').trim().toLowerCase();
        const isPolygon = geomTypeLower === 'polygon' || geomTypeLower === 'multipolygon';
        const isPoint = !isLine && !isPolygon;

        if (focusIds && focusIds.size > 0 && focusIds.has(feature.id)) {
            return true;
        }

        if (isPoint) {
            const group = feature.group_id ? featureGroups[feature.group_id] : null;
            const displayInfo = getFeatureDisplayInfo(feature, group?.type, group?.name, metadata);
            return zoom >= MAP_INTERSECTION_CHILD_MIN_ZOOM || !isMapIntersectionChild(feature, group, metadata, displayInfo);
        }
        return true;
    };
    const selectedRenderFeature = selected && canRenderFeature(selected)
        ? toRenderFeatures(selected, selectedFeatureId, featureGroups, featureNumberMap || {}, groupThemePreview)
        : [];
    const renderFeatures: MapLibreRenderFeature[] = [];
    let renderedPoints = 0;

    for (const feature of features) {
        if (feature.id === selectedFeatureId) continue;
        if (!canRenderFeature(feature)) continue;

        const isFocused = Boolean(focusIds && focusIds.size > 0 && focusIds.has(feature.id));
        const renderFeatureItems = toRenderFeatures(feature, selectedFeatureId, featureGroups, featureNumberMap || {}, groupThemePreview);
        for (const renderFeature of renderFeatureItems) {
            if (renderFeature.geometry.type === 'Point' || renderFeature.geometry.type === 'MultiPoint') {
                if (!isFocused && renderedPoints >= lodPolicy.maxFeatures) continue;
                renderedPoints += 1;
            }
            renderFeatures.push(renderFeature);
        }
    }

    if (selectedRenderFeature.length > 0) renderFeatures.unshift(...selectedRenderFeature);

    return {
        collection: {
            type: 'FeatureCollection',
            features: renderFeatures,
        },
        lodPolicy,
    };
};
