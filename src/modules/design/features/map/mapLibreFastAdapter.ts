import type { FeatureState } from '@CONTRACT/types';
import type {
    BuildMapLibreFeatureCollectionInput,
    MapLibreLodPolicy,
    MapLibreLodPolicyInput,
    MapLibreGroupThemePreview,
    MapLibrePreviewMetadata,
    MapLibreRenderFeature,
    MapLibreRenderFeatureCollection,
    MapLibreRenderFeatureProperties,
} from './mapLibreFastTypes';
import { getCoordinates } from './coordinateCache';
import { getParsedCoordinates } from '@TOOL/utils/featureUtils';
import { getFeatureDisplayInfo, isCameraIcon } from '@TOOL/utils/featureDisplay';
import { getFeatureMetadataValue, getParsedMetadata } from '@TOOL/utils/featureMetadata';
import {
    DEFAULT_FEATURE_COLOR,
    DEFAULT_LINE_COLOR,
    normalizeFeatureColor,
    normalizeFeatureSize,
} from '@TOOL/utils/featureSymbolStyle';
import { MAP_POINT_CLUSTER_HIDE_AT_ZOOM, MAP_INTERSECTION_CHILD_MIN_ZOOM, isMapIntersectionChild } from './mapDisplayPolicy';

const SUMMARY_FEATURE_LIMIT = 1800;
const DETAIL_FEATURE_LIMIT = 6000;
const FULL_FEATURE_LIMIT = 14000;

const SELECTED_COLOR = '#22d3ee';

const getMetadataHash = (meta: any): number => {
    if (!meta) return 0;
    const values = typeof meta === 'string'
        ? [meta]
        : [
            meta.icon,
            meta.type,
            meta.color,
            meta.gis?.color,
            meta.stroke,
            meta.gis?.stroke,
            meta.size,
            meta.gis?.size,
            meta.weight,
            meta.gis?.weight,
            meta.rotation,
            meta.gis?.rotation,
            meta.groupType,
            meta.groupName,
        ];
    let hash = 0;
    for (const value of values) {
        const text = value === undefined || value === null
            ? ''
            : typeof value === 'object'
                ? JSON.stringify(value) || ''
                : String(value);
        for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return hash;
};

const parseObjectCache = new Map<string, Record<string, any>>();
const parseObject = (value: unknown): Record<string, any> => {
    if (!value) return {};
    if (typeof value === 'string') {
        if (parseObjectCache.has(value)) {
            return parseObjectCache.get(value)!;
        }
        try {
            const parsed = JSON.parse(value);
            const res = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
            if (parseObjectCache.size > 2000) parseObjectCache.clear();
            parseObjectCache.set(value, res);
            return res;
        } catch {
            return {};
        }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
};

const simplifyLineCoordinates = (points: [number, number][], tolerance: number): [number, number][] => {
    if (points.length <= 2 || tolerance <= 0) return points;
    const result: [number, number][] = [points[0]];
    let prev = points[0];
    for (let i = 1; i < points.length - 1; i++) {
        const pt = points[i];
        const dx = Math.abs(pt[0] - prev[0]);
        const dy = Math.abs(pt[1] - prev[1]);
        if (dx + dy >= tolerance) {
            result.push(pt);
            prev = pt;
        }
    }
    result.push(points[points.length - 1]);
    return result.length >= 2 ? result : points;
};

const getFeatureMetadataWithGroupPreview = (
    feature: FeatureState,
    groupThemePreview?: MapLibreGroupThemePreview | null,
    previewMetadata?: MapLibrePreviewMetadata | null
) => {
    const metadata = getParsedMetadata(feature);
    const groupPreview = groupThemePreview && feature.group_id === groupThemePreview.groupId
        ? (groupThemePreview.config ?? {})
        : {};
    const isPreviewedFeature = Boolean(previewMetadata && (feature.id === previewMetadata.id || feature.id.startsWith(`${previewMetadata.id}::`)));
    const featurePreview = isPreviewedFeature ? (previewMetadata?.metadata || {}) : {};

    return {
        ...metadata,
        ...groupPreview,
        ...featurePreview,
        gis: {
            ...(metadata.gis || {}),
            ...(groupPreview.gis || {}),
            ...(featurePreview.gis || {}),
        },
        infrastructure: {
            ...(metadata.infrastructure || {}),
            ...(groupPreview.infrastructure || {}),
            ...(featurePreview.infrastructure || {}),
        },
        fiber: {
            ...(metadata.fiber || {}),
            ...(groupPreview.fiber || {}),
            ...(featurePreview.fiber || {}),
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

const asColor = (value: unknown, fallback: string) => normalizeFeatureColor(value, fallback);

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

const imageIdSafe = (value: unknown) => {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    return text.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9_-]+/g, '');
};

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
    if (zoom < 13 || featureCount > DETAIL_FEATURE_LIMIT) {
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
            showLabels: zoom >= 15,
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
    isLine: boolean,
    simplifyVectors = false,
    zoom = 16
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
        if (!lines) return null;
        const tolerance = simplifyVectors ? (zoom < 14 ? 0.0001 : 0.00003) : 0;
        const simplified = tolerance > 0 ? lines.map(line => simplifyLineCoordinates(line, tolerance)) : lines;
        return { type: 'MultiLineString', coordinates: simplified };
    }
    if (geomType === 'multipolygon') {
        const polygon = normalizeMultiPolygon(coordinates);
        return polygon ? { type: 'MultiPolygon', coordinates: polygon } : null;
    }
    if (isLine || geomType === 'linestring' || geomType === 'polyline' || geomType === 'line') {
        const line = normalizeLine(coordinates);
        if (!line) return null;
        const tolerance = simplifyVectors ? (zoom < 14 ? 0.0001 : 0.00003) : 0;
        const simplified = tolerance > 0 ? simplifyLineCoordinates(line, tolerance) : line;
        return { type: 'LineString', coordinates: simplified };
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

const featureRenderCache = new WeakMap<FeatureState, Map<string, MapLibreRenderFeature[]>>();

const getRenderStyleHash = (
    feature: FeatureState,
    metadata: Record<string, any>,
    group: Record<string, any> | null
) => {
    const properties = parseObject(feature.properties);
    return getMetadataHash({
        icon: [metadata.icon, properties.icon, properties.iconKey],
        type: [metadata.type, properties.type],
        color: [metadata.color, metadata.gis?.color, properties.color],
        size: [metadata.size, metadata.gis?.size, properties.size],
        rotation: [metadata.rotation, metadata.gis?.rotation, properties.rotation],
        groupType: group?.type,
        groupName: group?.name,
    });
};

const toRenderFeatures = (
    feature: FeatureState,
    selectedFeatureId: string | null | undefined,
    featureGroups: Record<string, any>,
    featureNumberMap: Record<string, string | number>,
    groupThemePreview?: MapLibreGroupThemePreview | null,
    previewMetadata?: MapLibrePreviewMetadata | null,
    childPath: string[] = [],
    simplifyVectors = false,
    zoom = 16
): MapLibreRenderFeature[] => {
    const selected = feature.id === selectedFeatureId;
    const metadata = getFeatureMetadataWithGroupPreview(feature, groupThemePreview, previewMetadata);
    const group = feature.group_id ? featureGroups[feature.group_id] ?? null : null;
    const renderStyleHash = getRenderStyleHash(feature, metadata, group);
    const isPreviewedFeature = Boolean(previewMetadata && (feature.id === previewMetadata.id || feature.id.startsWith(`${previewMetadata.id}::`)));
    const previewVersion = groupThemePreview ? JSON.stringify(groupThemePreview) : '';
    const previewMetaHash = isPreviewedFeature ? getMetadataHash(previewMetadata?.metadata) : '';
    const featureName = (isPreviewedFeature && previewMetadata?.name !== undefined) ? previewMetadata.name : feature.name;
    const cacheKey = `${selected ? 1 : 0}:${featureNumberMap[feature.id] || ''}:${previewVersion}:${previewMetaHash}:${renderStyleHash}:${featureName}:${simplifyVectors ? 1 : 0}:${zoom < 14 ? 0 : 1}`;

    let featureCache = featureRenderCache.get(feature);
    if (!featureCache) {
        featureCache = new Map();
        featureRenderCache.set(feature, featureCache);
    } else if (featureCache.has(cacheKey) && childPath.length === 0) {
        return featureCache.get(cacheKey)!;
    }

    const geometryInput = geometryInputForFeature(feature);
    const geomType = String(geometryInput.type || feature.geom_type || 'Point').toLowerCase();
    const isLine = isLineGeomType(feature, metadata);
    const baseSize = normalizeFeatureSize(styleValueFromMetadata(feature, metadata, 'size'), isLine ? 'line' : 'point');
    const iconColor = asColor(
        styleValueFromMetadata(feature, metadata, 'color'),
        isLine ? DEFAULT_LINE_COLOR : DEFAULT_FEATURE_COLOR,
    );
    const color = selected ? SELECTED_COLOR : iconColor;
    const size = selected ? Math.max(baseSize, 12) : baseSize;
    const childId = feature.id;
    const parentFeatureId = childPath.length > 0 ? childPath[0] : (feature.id.includes('::') ? feature.id.split('::')[0] : undefined);

    if (geomType === 'geometrycollection') {
        const geometries = Array.isArray((geometryInput as any).geometries) ? (geometryInput as any).geometries : [];
        const result = geometries.flatMap((geometry: any, index: number) => {
            const childFeature = {
                ...feature,
                id: `${feature.id}::g${index}`,
                geom_type: String(geometry?.type || ''),
                coordinates: geometry,
            } as FeatureState;
            const children = toRenderFeatures(childFeature, selectedFeatureId, featureGroups, featureNumberMap, groupThemePreview, previewMetadata, [feature.id, `g${index}`], simplifyVectors, zoom);
            if (children.length === 0) {
                console.warn('[mapLibreFastAdapter] Skipped invalid GeometryCollection child:', feature.id, index);
            }
            return children;
        });
        featureCache.set(cacheKey, result);
        return result;
    }

    const geometry = normalizeRenderableGeometry(geomType, (geometryInput as any).coordinates, isLine, simplifyVectors, zoom);
    if (!geometry) {
        console.warn('[mapLibreFastAdapter] Skipped invalid geometry:', feature.id, geomType);
        featureCache.set(cacheKey, []);
        return [];
    }

    const kind = renderGeomType(geometry);
    if (kind === 'point') {
        const displayInfo = getFeatureDisplayInfo(feature, group?.type, group?.name, metadata);
        const rawDisplaySize = metadata.gis?.size ?? metadata.size ?? feature?.properties?.size ?? size;
        const baseDisplaySize = normalizeFeatureSize(rawDisplaySize, 'point');
        const displaySize = selected ? Math.max(baseDisplaySize, 12) : baseDisplaySize;
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
                imageIdSafe(iconColor),
                imageIdSafe(displaySize),
                imageIdSafe(labelIndex),
                imageIdSafe(rotation),
            ].join('-')
            : '';
        const isIntersectionChild = isMapIntersectionChild(feature, group, metadata, displayInfo);
        const res = [{
            type: 'Feature' as const,
            geometry,
            properties: {
                id: childId,
                parentFeatureId,
                groupId: feature.group_id,
                layerId: feature.layer_id,
                name: featureName,
                geomType: 'point' as const,
                color,
                iconColor,
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
        featureCache.set(cacheKey, res);
        return res;
    }

    if (kind === 'line') {
        const dashArray = asDashArray(metadata.gis?.dashArray ?? metadata.dashArray);
        const lineProps: MapLibreRenderFeatureProperties = {
            id: childId,
            parentFeatureId,
            groupId: feature.group_id,
            layerId: feature.layer_id,
            name: featureName,
            geomType: 'line',
            color,
            size: Math.max(size || 3, selected ? 6 : 3),
            selected,
        };
        if (dashArray && dashArray.length >= 2) {
            lineProps.dashArray = dashArray;
        }
        const res = [{
            type: 'Feature' as const,
            geometry,
            properties: lineProps,
        }];
        featureCache.set(cacheKey, res);
        return res;
    }

    const res = [{
        type: 'Feature' as const,
        geometry,
        properties: {
            id: childId,
            parentFeatureId,
            groupId: feature.group_id,
            layerId: feature.layer_id,
            name: featureName,
            geomType: 'polygon' as const,
            color,
            size,
            selected,
        },
    }];
    featureCache.set(cacheKey, res);
    return res;
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
    previewMetadata = null,
}: BuildMapLibreFeatureCollectionInput): {
    collection: MapLibreRenderFeatureCollection;
    lodPolicy: MapLibreLodPolicy;
} => {
    const lodPolicy = getMapLibreLodPolicy({ zoom, featureCount: features.length, selectedFeatureId });
    const selected = selectedFeatureId ? features.find(feature => feature.id === selectedFeatureId) : null;
    const featureGroups = featureGroupsInput || {};
    const hasFocus = Boolean(focusIds && focusIds.size > 0);

    const renderFeatures: MapLibreRenderFeature[] = [];
    let renderedPoints = 0;

    const processFeature = (feature: FeatureState, isSel: boolean) => {
        const isFocused = hasFocus && focusIds!.has(feature.id);
        if (hasFocus && !isFocused && !isSel) return;
        if (hiddenIds.has(feature.id)) return;
        if (feature.group_id && hiddenIds.has(feature.group_id)) return;
        if (feature.layer_id && hiddenIds.has(feature.layer_id)) return;

        const renderFeatureItems = toRenderFeatures(
            feature,
            selectedFeatureId,
            featureGroups,
            featureNumberMap || {},
            groupThemePreview,
            previewMetadata,
            [],
            lodPolicy.simplifyVectors,
            zoom
        );

        if (renderFeatureItems.length === 0) return;

        // Intersection child check
        const firstItem = renderFeatureItems[0];
        if (firstItem && firstItem.properties.geomType === 'point' && firstItem.properties.isIntersectionChild) {
            if (zoom < MAP_INTERSECTION_CHILD_MIN_ZOOM && !isFocused && !isSel) {
                return;
            }
        }

        for (const renderFeature of renderFeatureItems) {
            if (renderFeature.geometry.type === 'Point' || renderFeature.geometry.type === 'MultiPoint') {
                if (!isSel) {
                    if (!isFocused && renderedPoints >= lodPolicy.maxFeatures) continue;
                    renderedPoints += 1;
                }
            }
            renderFeatures.push(renderFeature);
        }
    };

    if (selected) {
        processFeature(selected, true);
    }

    for (const feature of features) {
        if (feature.id === selectedFeatureId) continue;
        processFeature(feature, false);
    }

    return {
        collection: {
            type: 'FeatureCollection',
            features: renderFeatures,
        },
        lodPolicy,
    };
};
