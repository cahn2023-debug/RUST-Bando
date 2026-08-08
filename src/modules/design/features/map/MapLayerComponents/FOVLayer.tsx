import React from 'react';
import type { FeatureState } from '@CONTRACT/types';
import { useMapContext } from '../MapContext';
import { useDesignSync, EMPTY_OBJ } from '@IMPLEMENT/stores/useDesignSync';
import { useSettingsStore } from '@CORE/stores/useSettingsStore';
import {
    getFeatureDisplayInfo,
    getPointCoordinates,
    calculateFOVPoints,
    getFeatureMetadataValue
} from '@TOOL/utils/featureUtils';
import { getParsedMetadata } from './SharedMapComponents';
import { MAP_FOV_MIN_ZOOM, MAP_INTERSECTION_CHILD_MIN_ZOOM, isMapIntersectionChild } from '../mapDisplayPolicy';

const FOV_SOURCE_ID = 'maplibre-fov-source';
const FOV_FILL_LAYER_ID = 'maplibre-fov-fill';
const FOV_LINE_LAYER_ID = 'maplibre-fov-line';

const metadataNumber = (value: unknown, fallback: number) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};

type FovBounds = {
    south: number;
    north: number;
    west: number;
    east: number;
} | null;

type PreviewMetadata = { id: string; metadata: any } | null;

const isFovTypeEnabled = (iconKey: string, showFovTypes: string[]) => {
    if (showFovTypes.includes(iconKey)) return true;
    if (iconKey === 'cctv' && showFovTypes.includes('camera')) return true;
    if (iconKey === 'camera' && showFovTypes.includes('cctv')) return true;
    return false;
};

const isPointInBounds = ([lng, lat]: [number, number], bounds: FovBounds) => {
    if (!bounds) return true;
    return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
};

export const buildFovFeatureCollection = ({
    features,
    featureGroups,
    previewMetadata,
    showFovTypes,
    currentZoom,
    hiddenIds = new Set<string>(),
    focusIds,
    bounds = null,
    isClickThrough = false,
}: {
    features: FeatureState[];
    featureGroups: Record<string, any>;
    previewMetadata?: PreviewMetadata;
    showFovTypes: string[];
    currentZoom: number;
    hiddenIds?: Set<string>;
    focusIds?: Set<string>;
    bounds?: FovBounds;
    isClickThrough?: boolean;
}): GeoJSON.FeatureCollection => {
    const items: GeoJSON.Feature[] = [];

    for (const f of features) {
        if (hiddenIds.has(f.id)) continue;
        if (f.group_id && hiddenIds.has(f.group_id)) continue;
        if (f.layer_id && hiddenIds.has(f.layer_id)) continue;

        const geomType = String(f.geom_type || '').toLowerCase();
        if (geomType && geomType !== 'point') continue;

        const group = f.group_id ? featureGroups[f.group_id] : null;
        const metadata = getParsedMetadata(f, previewMetadata ?? null);
        const displayInfo = getFeatureDisplayInfo(f, group?.type, group?.name, metadata);
        const typeEnabled = isFovTypeEnabled(displayInfo.iconKey, showFovTypes);
        const showFov = getFeatureMetadataValue(f, 'gis.show_fov', 'show_fov', metadata) !== false;
        if (!displayInfo.isCamera || !typeEnabled || !showFov) continue;

        const isInsideIntersection = isMapIntersectionChild(f, group, metadata, displayInfo);
        const isFocused = Boolean(focusIds && focusIds.size > 0 && focusIds.has(f.id));
        if (!isFocused) {
            if (currentZoom < MAP_FOV_MIN_ZOOM) continue;
            if (isInsideIntersection && currentZoom < MAP_INTERSECTION_CHILD_MIN_ZOOM) continue;
        }

        const coords = getPointCoordinates(f);
        if (!coords || (!isFocused && !isPointInBounds(coords, bounds))) continue;

        const rotation = metadataNumber(getFeatureMetadataValue(f, 'gis.rotation', 'rotation', metadata), 0);
        const fovAngle = metadataNumber(getFeatureMetadataValue(f, 'gis.fov_angle', 'fov_angle', metadata), 60);
        const fovRadius = metadataNumber(getFeatureMetadataValue(f, 'gis.fov_radius', 'fov_radius', metadata), 50);
        const points = calculateFOVPoints(coords, fovRadius, rotation, fovAngle);
        if (points.length === 0) continue;

        const coordinates = points.map(point => [point[1], point[0]]);
        coordinates.push(coordinates[0]);
        items.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [coordinates] },
            properties: {
                id: f.id,
                color: displayInfo.color || '#3b82f6',
                clickThrough: isClickThrough,
                rotation,
                fovAngle,
                fovRadius,
            },
        });
    }

    return { type: 'FeatureCollection', features: items };
};

const removeFovLayers = (map: maplibregl.Map) => {
    try {
        if (!(map as any).style) return;
        if (map.getLayer(FOV_LINE_LAYER_ID)) map.removeLayer(FOV_LINE_LAYER_ID);
        if (map.getLayer(FOV_FILL_LAYER_ID)) map.removeLayer(FOV_FILL_LAYER_ID);
        if (map.getSource(FOV_SOURCE_ID)) map.removeSource(FOV_SOURCE_ID);
    } catch {
        // Layer cleanup can race with MapLibre style disposal.
    }
};

const ensureFovLayers = (map: maplibregl.Map, data: GeoJSON.FeatureCollection) => {
    const source = map.getSource(FOV_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
        source.setData(data);
        return;
    }

    map.addSource(FOV_SOURCE_ID, { type: 'geojson', data });
    map.addLayer({
        id: FOV_FILL_LAYER_ID,
        type: 'fill',
        source: FOV_SOURCE_ID,
        paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.15,
        },
    });
    map.addLayer({
        id: FOV_LINE_LAYER_ID,
        type: 'line',
        source: FOV_SOURCE_ID,
        paint: {
            'line-color': ['get', 'color'],
            'line-width': 1,
            'line-dasharray': [2, 2],
        },
    });
};

export const FOVLayer = React.memo(() => {
    const { map } = useMapContext();
    const rawFeatures = useDesignSync(s => s.state?.features || (EMPTY_OBJ as Record<string, any>));
    const visibleFeatures = useDesignSync(s => s.visibleFeatures);
    const isLargeProject = useDesignSync(s => Boolean(s.state?.isLargeProject));
    const featureGroups = useDesignSync(s => s.state?.feature_groups || (EMPTY_OBJ as Record<string, any>));
    const mapHiddenIds = useDesignSync(s => s.mapHiddenIds);
    const previewMetadata = useDesignSync(s => s.previewMetadata);
    const drawingMode = useDesignSync(s => s.drawingMode);
    const showFovTypes = useSettingsStore(s => s.showFovTypes);
    const [currentZoom, setCurrentZoom] = React.useState(() => map?.getZoom() ?? 0);
    const [viewportTick, setViewportTick] = React.useState(0);
    const [reportCaptureScope, setReportCaptureScope] = React.useState<{
        active: boolean;
        focusFeatureIds?: string[];
    } | null>(null);

    React.useEffect(() => {
        const handleReportCapture = (event: Event) => {
            const detail = (event as CustomEvent<any>).detail;
            if (!detail?.active) {
                setReportCaptureScope(null);
                return;
            }
            setReportCaptureScope({
                active: true,
                focusFeatureIds: Array.isArray(detail.focusFeatureIds) ? detail.focusFeatureIds : [],
            });
        };
        window.addEventListener('design-report-map-capture', handleReportCapture);
        return () => {
            window.removeEventListener('design-report-map-capture', handleReportCapture);
        };
    }, []);

    React.useEffect(() => {
        if (!map) return;
        const syncViewport = () => {
            setCurrentZoom(map.getZoom());
            setViewportTick(tick => tick + 1);
        };
        syncViewport();
        map.on('zoomend', syncViewport);
        map.on('moveend', syncViewport);
        return () => {
            map.off('zoomend', syncViewport);
            map.off('moveend', syncViewport);
        };
    }, [map]);

    const collection = React.useMemo<GeoJSON.FeatureCollection>(() => {
        const features = Object.values(reportCaptureScope?.active ? rawFeatures : isLargeProject ? visibleFeatures : rawFeatures);
        const isClickThrough = drawingMode !== 'none' && drawingMode !== 'move';
        const mapBounds = map?.getBounds();
        const bounds = reportCaptureScope?.active || !mapBounds
            ? null
            : {
                south: mapBounds.getSouth(),
                north: mapBounds.getNorth(),
                west: mapBounds.getWest(),
                east: mapBounds.getEast(),
            };
        const focusIds = new Set(reportCaptureScope?.active ? reportCaptureScope.focusFeatureIds || [] : []);

        return buildFovFeatureCollection({
            features,
            featureGroups,
            previewMetadata,
            showFovTypes,
            currentZoom,
            hiddenIds: mapHiddenIds,
            focusIds,
            bounds,
            isClickThrough,
        });
    }, [currentZoom, drawingMode, featureGroups, isLargeProject, map, mapHiddenIds, previewMetadata, rawFeatures, reportCaptureScope, showFovTypes, viewportTick, visibleFeatures]);

    React.useEffect(() => {
        if (!map) return;
        if (collection.features.length === 0) {
            removeFovLayers(map);
            return;
        }

        const apply = () => ensureFovLayers(map, collection);
        if (map.isStyleLoaded()) apply();
        else map.once('styledata', apply);

        return () => {
            map.off('styledata', apply);
        };
    }, [collection, map]);

    React.useEffect(() => () => {
        if (map) removeFovLayers(map);
    }, [map]);

    return null;
});
