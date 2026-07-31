import React from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useDesignSync, EMPTY_OBJ } from '@IMPLEMENT/stores/useDesignSync';
import { useFeatureNumbering } from '@IMPLEMENT/hooks/useDesignFeatures';
import { useSnap } from '@IMPLEMENT/hooks/useSnap';
import { queryVisibleFeaturesV2 } from '@TOOL/utils/designIpc';
import { confirmUserAction } from '@TOOL/utils/userConfirmation';
import { getParsedCoordinates, getParsedMetadata } from '@TOOL/utils/featureUtils';
import { useMapStyles } from './useMapStyles';
import { buildMapLibreFeatureCollection } from './mapLibreFastAdapter';
import { buildRenderMetrics } from './mapRenderMetrics';
import { getIconSvgString } from '@DESIGN/components/icons/MapIcons';
import { buildPolylineSnapMarkers, type PolylineSnapMarker } from './polylineSnapMarkers';
import type { FeatureState } from '@CONTRACT/types';
import type { MapLibreFastFeatureCollection, MapLibreRenderFeatureCollection } from './mapLibreFastTypes';
import { useMapContext } from './MapContext';

const SOURCE_ID = 'design-fast-features';
const BASEMAP_SOURCE_ID = 'basemap';
const POINT_LAYER_ID = 'design-fast-points';
const POINT_ICON_LAYER_ID = 'design-fast-point-icons';
const POINT_LABEL_LAYER_ID = 'design-fast-point-labels';
const POINT_CLUSTER_LAYER_ID = 'design-fast-point-clusters';
const LINE_HIT_LAYER_ID = 'design-fast-line-hit-area';
const LINE_LAYER_ID = 'design-fast-lines';
const POLYGON_LAYER_ID = 'design-fast-polygons';
const POLYGON_STROKE_LAYER_ID = 'design-fast-polygon-strokes';
const LABEL_LAYER_ID = 'design-fast-labels';
const DRAWING_SOURCE_ID = 'design-fast-drawing';
const DRAWING_LINE_LAYER_ID = 'design-fast-drawing-line';
const DRAWING_VERTEX_LAYER_ID = 'design-fast-drawing-vertices';
const SNAP_LAYER_ID = 'design-fast-snap-indicator';
const EDIT_SOURCE_ID = 'design-fast-edit-handles';
const EDIT_VERTEX_LAYER_ID = 'design-fast-edit-vertices';
const EDIT_MIDPOINT_LAYER_ID = 'design-fast-edit-midpoints';
const EDIT_SNAP_LINK_LAYER_ID = 'design-fast-edit-snap-links';
const MAP_MAX_ZOOM = 23;
const MAP_MAX_NATIVE_ZOOM = 20;

const emptyCollection: MapLibreRenderFeatureCollection = {
    type: 'FeatureCollection',
    features: [],
};

const emptyOverlayCollection: MapLibreFastFeatureCollection = {
    type: 'FeatureCollection',
    features: [],
};

const canUsePerformanceNow = () => typeof performance !== 'undefined' && typeof performance.now === 'function';
const now = () => canUsePerformanceNow() ? performance.now() : Date.now();

const toLngLat = (center: [number, number]): [number, number] => [center[1], center[0]];

const createRasterStyle = (tileUrls: string[]): maplibregl.StyleSpecification => ({
    version: 8,
    sources: {
        [BASEMAP_SOURCE_ID]: {
            type: 'raster',
            tiles: tileUrls,
            tileSize: 256,
            maxzoom: MAP_MAX_NATIVE_ZOOM,
        },
    },
    layers: [
        {
            id: 'basemap',
            type: 'raster',
            source: BASEMAP_SOURCE_ID,
        },
    ],
});

const updateRasterSourceTiles = (map: maplibregl.Map, sourceId: string, tileUrls: string[]) => {
    const source = map.getSource(sourceId) as {
        setTiles?: (tiles: string[]) => void;
        reload?: () => void;
    } | undefined;
    if (!source) return false;
    if (typeof source.setTiles !== 'function') return false;
    source.setTiles(tileUrls);
    source.reload?.();
    map.triggerRepaint();
    return true;
};

type MapLibreImageData = {
    width: number;
    height: number;
    data: Uint8ClampedArray;
};

const MAX_IMAGE_CACHE_SIZE = 256;
const imageCache = new Map<string, Promise<MapLibreImageData>>();

export const clearMapImageCache = () => {
    imageCache.clear();
};

const escapeSvgText = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const svgBlob = (svg: string) => new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });

const svgSize = (svg: string) => {
    const width = Number(svg.match(/\bwidth="(\d+(?:\.\d+)?)"/)?.[1]);
    const height = Number(svg.match(/\bheight="(\d+(?:\.\d+)?)"/)?.[1]);
    return {
        width: Number.isFinite(width) && width > 0 ? Math.ceil(width) : 24,
        height: Number.isFinite(height) && height > 0 ? Math.ceil(height) : 24,
    };
};

const loadSvgBitmap = (blob: Blob) => {
    const loadWithImageElement = () => new Promise<CanvasImageSource>((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = error => {
            URL.revokeObjectURL(url);
            reject(error);
        };
        image.src = url;
    });

    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(blob).catch(loadWithImageElement);
    }

    return loadWithImageElement();
};

const loadSvgImage = (id: string, svg: string) => {
    const cached = imageCache.get(id);
    if (cached) {
        imageCache.delete(id);
        imageCache.set(id, cached);
        return cached;
    }

    const promise = (async (): Promise<MapLibreImageData> => {
        const { width, height } = svgSize(svg);
        const bitmap = await loadSvgBitmap(svgBlob(svg));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context is unavailable');
        context.clearRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        return context.getImageData(0, 0, width, height);
    })();
    imageCache.set(id, promise);
    while (imageCache.size > MAX_IMAGE_CACHE_SIZE) {
        const oldestKey = imageCache.keys().next().value;
        if (!oldestKey) break;
        imageCache.delete(oldestKey);
    }
    return promise;
};

const iconSvgForFeature = (properties: Record<string, any>) => {
    const color = String(properties.color || '#6366f1');
    const size = Number(properties.displaySize || properties.size || 24);
    const labelIndex = escapeSvgText(properties.labelIndex || '');
    if (properties.isIntersection) {
        const textColor = ['#ffffff', 'white', '#fff'].includes(color.toLowerCase().trim()) ? '#111827' : '#ffffff';
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
            <g transform="rotate(45 12 12)" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 2 L8 8 L2 8"/>
                <path d="M16 2 L16 8 L22 8"/>
                <path d="M22 16 L16 16 L16 22"/>
                <path d="M8 22 L8 16 L2 16"/>
            </g>
            ${labelIndex ? `<text x="12" y="15" font-family="Arial, sans-serif" font-size="8" font-weight="900" text-anchor="middle" fill="${textColor}" stroke="rgba(0,0,0,0.7)" stroke-width="1" paint-order="stroke">${labelIndex}</text>` : ''}
        </svg>`;
    }
    return getIconSvgString(
        String(properties.iconKey || 'cctv'),
        color,
        size,
        labelIndex,
        Number(properties.rotation || 0)
    );
};

const parseIconImageId = (imageId: string): Record<string, any> | null => {
    if (!imageId || !imageId.startsWith('design-point-')) return null;
    const raw = imageId.slice('design-point-'.length);
    const parts = raw.split('-');
    if (parts.length < 5) return null;
    const iconKey = parts[0];
    const color = parts[1] ? `#${parts[1]}` : '#6366f1';
    const displaySize = Number(parts[2]) || 24;
    const labelIndex = parts[3];
    const rotation = Number(parts[4]) || 0;
    return {
        iconKey,
        color,
        displaySize,
        labelIndex,
        rotation,
        isIntersection: iconKey === 'intersection',
        isCamera: iconKey === 'cctv' || iconKey.includes('camera'),
    };
};

const ensurePointImages = (map: maplibregl.Map, collection: MapLibreRenderFeatureCollection) => {
    for (const feature of collection.features) {
        const properties = feature.properties as Record<string, any>;
        const imageId = properties.iconImageId;
        if (!imageId || map.hasImage(imageId)) continue;
        const svg = iconSvgForFeature(properties);
        void loadSvgImage(imageId, svg)
            .then(image => {
                if (!map.hasImage(imageId)) {
                    map.addImage(imageId, image);
                    map.triggerRepaint();
                }
            })
            .catch(error => console.warn('[MapLibreFastRenderer] Failed to load point icon:', imageId, error));
    }
};

const setGeoJsonData = (
    map: maplibregl.Map,
    sourceId: string,
    data: MapLibreFastFeatureCollection | MapLibreRenderFeatureCollection
) => {
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    source?.setData(data as any);
};

const toLngLatEvent = (event: any) => ({
    lat: event.lngLat.lat,
    lng: event.lngLat.lng,
});

const featureCoordinates = (feature: FeatureState | null): [number, number][] => {
    if (!feature) return [];
    const parsed = getParsedCoordinates(feature);
    if (!parsed || !Array.isArray(parsed)) return [];
    const isPolygon = feature.geom_type?.toLowerCase() === 'polygon';
    const coords = isPolygon ? (Array.isArray((parsed as any)[0]) ? (parsed as any)[0] : parsed) : parsed;
    return Array.isArray(coords) ? coords as [number, number][] : [];
};

const buildDrawingOverlay = (
    currentDrawingPoints: [number, number][],
    snappedPoint: { x: number; y: number; id?: string } | null
): MapLibreFastFeatureCollection => {
    const features: MapLibreFastFeatureCollection['features'] = [];
    if (currentDrawingPoints.length >= 2) {
        features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: currentDrawingPoints },
            properties: { kind: 'drawing-line' },
        });
    }
    currentDrawingPoints.forEach((point, index) => {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: point },
            properties: { kind: 'drawing-vertex', index },
        });
    });
    if (snappedPoint) {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [snappedPoint.x, snappedPoint.y] },
            properties: { kind: 'snap' },
        });
    }
    return { type: 'FeatureCollection', features };
};

const buildEditOverlay = (
    coords: [number, number][],
    snapMarkers: PolylineSnapMarker[] = []
): MapLibreFastFeatureCollection => {
    const features: MapLibreFastFeatureCollection['features'] = [];
    coords.forEach((point, index) => {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: point },
            properties: { kind: 'vertex', index },
        });
    });
    coords.slice(0, -1).forEach((point, index) => {
        const next = coords[index + 1];
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2] },
            properties: { kind: 'midpoint', index: index + 1 },
        });
    });
    snapMarkers.forEach(marker => {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: marker.coordinate },
            properties: { kind: 'snap-link', index: marker.index, targetId: marker.targetId },
        });
    });
    return { type: 'FeatureCollection', features };
};

const moveLayerToTop = (map: maplibregl.Map, layerId: string) => {
    if (!map.getLayer(layerId) || typeof (map as any).moveLayer !== 'function') return;
    (map as any).moveLayer(layerId);
};

const ensureDesignLayers = (map: maplibregl.Map, clusterPoints: boolean, showLabels: boolean) => {
    if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
            type: 'geojson',
            data: emptyCollection as any,
            promoteId: 'id',
            cluster: clusterPoints,
            clusterRadius: 48,
            clusterMaxZoom: 15,
        });
    }

    if (!map.getLayer(POLYGON_LAYER_ID)) {
        map.addLayer({
            id: POLYGON_LAYER_ID,
            type: 'fill',
            source: SOURCE_ID,
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: {
                'fill-color': ['get', 'color'],
                'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.42, 0.18],
            },
        });
    }

    if (!map.getLayer(POLYGON_STROKE_LAYER_ID)) {
        map.addLayer({
            id: POLYGON_STROKE_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: {
                'line-color': ['get', 'color'],
                'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 4, 1.5],
                'line-opacity': 0.9,
            },
        });
    }

    if (!map.getLayer(LINE_HIT_LAYER_ID)) {
        map.addLayer({
            id: LINE_HIT_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            filter: ['==', ['geometry-type'], 'LineString'],
            paint: {
                'line-color': '#000000',
                'line-width': ['max', 18, ['+', ['get', 'size'], 10]],
                'line-opacity': 0.01,
            },
            layout: {
                'line-cap': 'round',
                'line-join': 'round',
            },
        });
    }

    if (!map.getLayer(LINE_LAYER_ID)) {
        map.addLayer({
            id: LINE_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            filter: ['==', ['geometry-type'], 'LineString'],
            paint: {
                'line-color': ['get', 'color'],
                'line-width': ['get', 'size'],
                'line-dasharray': ['case', ['has', 'dashArray'], ['get', 'dashArray'], ['literal', [1, 0]]],
                'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.98, 0.74],
            },
            layout: {
                'line-cap': 'round',
                'line-join': 'round',
            },
        });
    }

    if (!map.getLayer(POINT_CLUSTER_LAYER_ID)) {
        map.addLayer({
            id: POINT_CLUSTER_LAYER_ID,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': '#0f766e',
                'circle-radius': ['step', ['get', 'point_count'], 16, 100, 22, 1000, 30],
                'circle-opacity': 0.82,
                'circle-stroke-color': '#ecfeff',
                'circle-stroke-width': 1,
            },
        });
    }

    if (!map.getLayer(POINT_LAYER_ID)) {
        map.addLayer({
            id: POINT_LAYER_ID,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'point_count']]],
            paint: {
                'circle-color': ['get', 'color'],
                'circle-radius': [
                    'case',
                    ['to-boolean', ['get', 'iconImageId']],
                    ['case', ['boolean', ['feature-state', 'selected'], false], ['/', ['get', 'displaySize'], 2], ['/', ['get', 'displaySize'], 2.15]],
                    ['/', ['get', 'displaySize'], 2],
                ],
                'circle-opacity': [
                    'case',
                    ['to-boolean', ['get', 'iconImageId']],
                    0,
                    ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0.82],
                ],
                'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#ecfeff', '#ffffff'],
                'circle-stroke-width': [
                    'case',
                    ['to-boolean', ['get', 'iconImageId']],
                    0,
                    ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.5],
                ],
            },
        });
    }

    if (!map.getLayer(POINT_ICON_LAYER_ID)) {
        map.addLayer({
            id: POINT_ICON_LAYER_ID,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'point_count']], ['to-boolean', ['get', 'iconImageId']]],
            layout: {
                'icon-image': ['get', 'iconImageId'],
                'icon-size': 1,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
            },
        });
    }

    if (!map.getLayer(POINT_LABEL_LAYER_ID)) {
        map.addLayer({
            id: POINT_LABEL_LAYER_ID,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'point_count']], ['!', ['to-boolean', ['get', 'iconImageId']]]],
            layout: {
                'text-field': ['get', 'labelIndex'],
                'text-size': 11,
                'text-anchor': 'center',
                'text-allow-overlap': true,
                'text-ignore-placement': true,
            },
            paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#0f172a',
                'text-halo-width': 1,
            },
        });
    }

    if (!map.getLayer(LABEL_LAYER_ID)) {
        map.addLayer({
            id: LABEL_LAYER_ID,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['!', ['has', 'point_count']],
            layout: {
                'text-field': ['get', 'name'],
                'text-size': 11,
                'text-offset': [0, 1.15],
                'text-anchor': 'top',
            },
            paint: {
                'text-color': '#f8fafc',
                'text-halo-color': '#0f172a',
                'text-halo-width': 1.2,
            },
        });
    }

    map.setLayoutProperty(POINT_CLUSTER_LAYER_ID, 'visibility', clusterPoints ? 'visible' : 'none');
    map.setLayoutProperty(LABEL_LAYER_ID, 'visibility', showLabels ? 'visible' : 'none');
};

const ensureOverlayLayers = (map: maplibregl.Map) => {
    if (!map.getSource(DRAWING_SOURCE_ID)) {
        map.addSource(DRAWING_SOURCE_ID, { type: 'geojson', data: emptyOverlayCollection as any });
    }
    if (!map.getSource(EDIT_SOURCE_ID)) {
        map.addSource(EDIT_SOURCE_ID, { type: 'geojson', data: emptyOverlayCollection as any });
    }
    if (!map.getLayer(DRAWING_LINE_LAYER_ID)) {
        map.addLayer({
            id: DRAWING_LINE_LAYER_ID,
            type: 'line',
            source: DRAWING_SOURCE_ID,
            filter: ['==', ['get', 'kind'], 'drawing-line'],
            paint: {
                'line-color': '#06b6d4',
                'line-width': 3,
                'line-dasharray': [1.5, 3],
                'line-opacity': 0.8,
            },
        });
    }
    if (!map.getLayer(DRAWING_VERTEX_LAYER_ID)) {
        map.addLayer({
            id: DRAWING_VERTEX_LAYER_ID,
            type: 'circle',
            source: DRAWING_SOURCE_ID,
            filter: ['==', ['get', 'kind'], 'drawing-vertex'],
            paint: {
                'circle-radius': 5,
                'circle-color': '#ffffff',
                'circle-stroke-color': '#06b6d4',
                'circle-stroke-width': 2,
            },
        });
    }
    if (!map.getLayer(SNAP_LAYER_ID)) {
        map.addLayer({
            id: SNAP_LAYER_ID,
            type: 'circle',
            source: DRAWING_SOURCE_ID,
            filter: ['==', ['get', 'kind'], 'snap'],
            paint: {
                'circle-radius': 7,
                'circle-color': 'rgba(251, 146, 60, 0.42)',
                'circle-stroke-color': '#fb923c',
                'circle-stroke-width': 2,
                'circle-blur': 0.2,
            },
        });
    }
    if (!map.getLayer(EDIT_VERTEX_LAYER_ID)) {
        map.addLayer({
            id: EDIT_VERTEX_LAYER_ID,
            type: 'circle',
            source: EDIT_SOURCE_ID,
            filter: ['==', ['get', 'kind'], 'vertex'],
            paint: {
                'circle-radius': 8,
                'circle-color': '#3b82f6',
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
            },
        });
    }
    if (!map.getLayer(EDIT_MIDPOINT_LAYER_ID)) {
        map.addLayer({
            id: EDIT_MIDPOINT_LAYER_ID,
            type: 'circle',
            source: EDIT_SOURCE_ID,
            filter: ['==', ['get', 'kind'], 'midpoint'],
            paint: {
                'circle-radius': 6,
                'circle-color': '#ffffff',
                'circle-opacity': 0.65,
                'circle-stroke-color': '#3b82f6',
                'circle-stroke-width': 2,
            },
        });
    }
    if (!map.getLayer(EDIT_SNAP_LINK_LAYER_ID)) {
        map.addLayer({
            id: EDIT_SNAP_LINK_LAYER_ID,
            type: 'circle',
            source: EDIT_SOURCE_ID,
            filter: ['==', ['get', 'kind'], 'snap-link'],
            paint: {
                'circle-radius': 7,
                'circle-color': 'rgba(251, 146, 60, 0.72)',
                'circle-stroke-color': '#fff7ed',
                'circle-stroke-width': 2,
                'circle-blur': 0.05,
            },
        });
    }

    [
        DRAWING_LINE_LAYER_ID,
        DRAWING_VERTEX_LAYER_ID,
        SNAP_LAYER_ID,
        EDIT_VERTEX_LAYER_ID,
        EDIT_MIDPOINT_LAYER_ID,
        EDIT_SNAP_LINK_LAYER_ID,
    ].forEach(layerId => moveLayerToTop(map, layerId));
};

export function MapLibreFastRenderer({
    center,
    zoom,
    onLocationChange,
    onFinishDrawing,
    onFinishDrawingSession,
    isMeasureActive = false,
    basemapTiles: basemapTilesProp,
    basemapKey,
}: {
    center: [number, number];
    zoom: number;
    onLocationChange?: (lat: number, lng: number, snapId?: string | null) => void;
    onFinishDrawing?: () => void;
    onFinishDrawingSession?: () => void;
    isMeasureActive?: boolean;
    basemapTiles?: string[];
    basemapKey?: string;
}) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const mapRef = React.useRef<maplibregl.Map | null>(null);
    let setMap: (map: maplibregl.Map | null) => void = () => {};
    try {
        setMap = useMapContext().setMap;
    } catch {
        // MapProvider optional
    }
    const requestRef = React.useRef(0);
    const lastBasemapTilesKeyRef = React.useRef<string | null>(null);
    const selectedFeatureRef = React.useRef<string | null>(null);
    const features = useDesignSync(s => s.visibleFeatures);
    const rawFeatures = useDesignSync(s => s.state?.features || (EMPTY_OBJ as Record<string, FeatureState>));
    const isLargeProject = useDesignSync(s => Boolean(s.state?.isLargeProject));
    const featureGroups = useDesignSync(s => s.state?.feature_groups || (EMPTY_OBJ as Record<string, any>));
    const projectId = useDesignSync(s => s.projectId);
    const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
    const mapHiddenIds = useDesignSync(s => s.mapHiddenIds);
    const groupThemePreview = useDesignSync(s => s.groupThemePreview);
    const drawingMode = useDesignSync(s => s.drawingMode);
    const editingFeatureId = useDesignSync(s => s.editingFeatureId);
    const currentDrawingPoints = useDesignSync(s => s.currentDrawingPoints);
    const snappedPoint = useDesignSync(s => s.snappedPoint);
    const viewportFeatureLimit = useDesignSync(s => s.state?.viewportFeatureLimit || 10000);
    const mapRevision = useDesignSync(s => s.state?.mapRevision || 0);
    const viewportRevision = useDesignSync(s => s.viewportRevision);
    const selectFeature = useDesignSync(s => s.selectFeature);
    const setHoverId = useDesignSync(s => s.setHoverId);
    const setDrawingPoint = useDesignSync(s => s.setDrawingPoint);
    const insertDrawingPoint = useDesignSync(s => s.insertDrawingPoint);
    const zoomToTrigger = useDesignSync(s => s.zoomToTrigger);
    const setViewportFeatures = useDesignSync(s => s.setViewportFeatures);
    const setViewportLoading = useDesignSync(s => s.setViewportLoading);
    const setRenderMetrics = useDesignSync(s => s.setRenderMetrics);
    const { performSnap, snapNow, clearSnap, snappedPointRef } = useSnap();
    const { getStyledTiles: getFallbackStyledTiles, mapKey: fallbackMapKey } = useMapStyles();
    const basemapTiles = React.useMemo(
        () => basemapTilesProp || getFallbackStyledTiles(),
        [basemapKey, basemapTilesProp, fallbackMapKey, getFallbackStyledTiles]
    );
    const basemapTilesKey = React.useMemo(() => basemapKey || basemapTiles.join('|'), [basemapKey, basemapTiles]);
    const [currentZoom, setCurrentZoom] = React.useState(zoom);
    const [viewportTick, setViewportTick] = React.useState(0);
    const renderFeatureValues = React.useMemo(
        () => Object.values(isLargeProject ? features : rawFeatures),
        [features, isLargeProject, rawFeatures]
    );
    const renderFeatureRecord = React.useMemo(() => {
        const record: Record<string, FeatureState> = {};
        for (const feature of renderFeatureValues as FeatureState[]) {
            if (feature?.id) record[feature.id] = feature;
        }
        return record;
    }, [renderFeatureValues]);
    const featureNumberMap = useFeatureNumbering(renderFeatureRecord);
    const editingFeature = React.useMemo(
        () => editingFeatureId ? (rawFeatures as Record<string, FeatureState>)[editingFeatureId] || (features as Record<string, FeatureState>)[editingFeatureId] || null : null,
        [editingFeatureId, features, rawFeatures]
    );
    const selectedFeature = React.useMemo(
        () => selectedFeatureId ? (rawFeatures as Record<string, FeatureState>)[selectedFeatureId] || (features as Record<string, FeatureState>)[selectedFeatureId] || null : null,
        [features, rawFeatures, selectedFeatureId]
    );
    const snapFeatureRecord = React.useMemo(() => {
        const record: Record<string, FeatureState> = {
            ...(features as Record<string, FeatureState>),
            ...(rawFeatures as Record<string, FeatureState>),
        };
        if (selectedFeature?.id) record[selectedFeature.id] = selectedFeature;
        if (editingFeature?.id) record[editingFeature.id] = editingFeature;
        return record;
    }, [editingFeature, features, rawFeatures, selectedFeature]);
    const editCoords = React.useMemo(() => featureCoordinates(editingFeature || selectedFeature), [editingFeature, selectedFeature]);
    const polylineSnapMarkers = React.useMemo(() => {
        const feature = editingFeature || selectedFeature;
        if (!feature) return [];
        return buildPolylineSnapMarkers(feature, snapFeatureRecord, getParsedMetadata(feature));
    }, [editingFeature, selectedFeature, snapFeatureRecord]);
    const dragRef = React.useRef<{ index: number; type: 'update' | 'insert' } | null>(null);
    const latestRef = React.useRef({
        drawingMode,
        editingFeatureId,
        editCoords,
        performSnap,
        snapNow,
        clearSnap,
        snappedPointRef,
        onLocationChange,
        onFinishDrawing,
        onFinishDrawingSession,
        setDrawingPoint,
        insertDrawingPoint,
        isMeasureActive,
    });

    React.useEffect(() => {
        latestRef.current = {
            drawingMode,
            editingFeatureId,
            editCoords,
            performSnap,
            snapNow,
            clearSnap,
            snappedPointRef,
            onLocationChange,
            onFinishDrawing,
            onFinishDrawingSession,
            setDrawingPoint,
            insertDrawingPoint,
            isMeasureActive,
        };
    }, [
        drawingMode,
        editingFeatureId,
        editCoords,
        performSnap,
        snapNow,
        clearSnap,
        snappedPointRef,
        onLocationChange,
        onFinishDrawing,
        onFinishDrawingSession,
        setDrawingPoint,
        insertDrawingPoint,
        isMeasureActive,
    ]);

    React.useEffect(() => {
        if (!containerRef.current || mapRef.current) return;
        const map = new maplibregl.Map({
            container: containerRef.current,
            style: createRasterStyle(basemapTiles),
            center: toLngLat(center),
            zoom,
            maxZoom: MAP_MAX_ZOOM,
            attributionControl: false,
            canvasContextAttributes: {
                preserveDrawingBuffer: true,
            },
        });
        mapRef.current = map;
        lastBasemapTilesKeyRef.current = basemapTilesKey;

        map.on('zoomend', () => setCurrentZoom(map.getZoom()));
        map.on('moveend', () => {
            setCurrentZoom(map.getZoom());
            setViewportTick(tick => tick + 1);
        });
        map.once('load', () => setViewportTick(tick => tick + 1));
        map.on('styleimagemissing', e => {
            const id = e.id;
            if (!id || map.hasImage(id)) return;
            const props = parseIconImageId(id);
            if (!props) return;
            const svg = iconSvgForFeature(props);
            void loadSvgImage(id, svg).then(image => {
                if (!map.hasImage(id)) {
                    map.addImage(id, image);
                }
            });
        });

        const interactiveLayers = [POINT_LAYER_ID, POINT_ICON_LAYER_ID, POINT_LABEL_LAYER_ID, LINE_HIT_LAYER_ID, LINE_LAYER_ID, POLYGON_LAYER_ID];
        map.on('click', interactiveLayers, event => {
            if (latestRef.current.drawingMode !== 'none') return;
            const feature = event.features?.[0];
            const id = feature?.properties?.id;
            if (typeof id !== 'string') return;
            const lngLat = event.lngLat;
            selectFeature(id, false, [lngLat.lat, lngLat.lng]);
        });
        map.on('mousemove', interactiveLayers, event => {
            const id = event.features?.[0]?.properties?.id;
            setHoverId(typeof id === 'string' ? id : null);
            map.getCanvas().style.cursor = id ? 'pointer' : '';
        });
        map.on('mouseleave', interactiveLayers, () => {
            setHoverId(null);
            map.getCanvas().style.cursor = '';
        });

        map.on('click', async event => {
            const latest = latestRef.current;
            if (latest.drawingMode === 'none') return;
            const { lat, lng } = toLngLatEvent(event);
            let snapped = latest.snappedPointRef.current;
            if (!snapped) snapped = await latest.snapNow(lat, lng, 0.00002);
            latest.onLocationChange?.(snapped ? snapped.y : lat, snapped ? snapped.x : lng, snapped?.id || null);
        });
        map.on('dblclick', event => {
            const latest = latestRef.current;
            if (latest.drawingMode !== 'polyline') return;
            event.preventDefault();
            latest.onFinishDrawing?.();
        });
        map.on('contextmenu', event => {
            const latest = latestRef.current;
            if (latest.drawingMode !== 'none') {
                event.preventDefault();
                latest.onFinishDrawingSession?.();
            }
        });
        map.on('mousemove', event => {
            const latest = latestRef.current;
            if (latest.drawingMode === 'none' && !latest.editingFeatureId) return;
            const { lat, lng } = toLngLatEvent(event);
            latest.performSnap(lat, lng);
        });
        map.on('mouseout', () => {
            const latest = latestRef.current;
            if (latest.drawingMode === 'none' && !latest.editingFeatureId) return;
            latest.clearSnap();
        });

        const startEditDrag = (type: 'update' | 'insert') => (event: any) => {
            const feature = event.features?.[0];
            const index = Number(feature?.properties?.index);
            if (!Number.isInteger(index)) return;
            event.preventDefault();
            dragRef.current = { index, type };
            map.dragPan.disable();
            map.getCanvas().style.cursor = 'grabbing';
        };
        map.on('mousedown', EDIT_VERTEX_LAYER_ID, startEditDrag('update'));
        map.on('mousedown', EDIT_MIDPOINT_LAYER_ID, startEditDrag('insert'));
        map.on('mouseup', async event => {
            const drag = dragRef.current;
            if (!drag) return;
            dragRef.current = null;
            map.dragPan.enable();
            map.getCanvas().style.cursor = '';

            const latest = latestRef.current;
            const { lat, lng } = toLngLatEvent(event);
            let snapped = latest.snappedPointRef.current;
            if (!snapped) snapped = await latest.snapNow(lat, lng, 0.00003);
            const finalLat = snapped ? snapped.y : lat;
            const finalLng = snapped ? snapped.x : lng;
            if (!(await confirmUserAction('Xác nhận thay đổi vị trí điểm này?'))) {
                latest.clearSnap();
                return;
            }
            if (drag.type === 'insert') {
                await latest.insertDrawingPoint(drag.index, finalLat, finalLng);
            } else {
                await latest.setDrawingPoint(drag.index, finalLat, finalLng, snapped?.id || null);
            }
            latest.clearSnap();
        });

        try {
            setMap(map);
        } catch {
            // Optional MapProvider
        }

        return () => {
            try {
                setMap(null);
            } catch {
                // Optional MapProvider
            }
            clearMapImageCache();
            map.remove();
            mapRef.current = null;
        };
    }, []);

    React.useEffect(() => {
        const map = mapRef.current;
        if (!map || !isLargeProject || !projectId) return;
        const bounds = map.getBounds();
        const requestId = ++requestRef.current;
        const queryStart = now();
        setViewportLoading(true);
        queryVisibleFeaturesV2(
            projectId,
            {
                s: bounds.getSouth(),
                n: bounds.getNorth(),
                w: bounds.getWest(),
                e: bounds.getEast(),
            },
            map.getZoom(),
            Array.from(mapHiddenIds),
            viewportFeatureLimit,
            true,
            mapRevision,
            requestId
        )
            .then(response => {
                if (requestId !== requestRef.current) return;
                if (typeof response.revision === 'number' && response.revision !== mapRevision) return;
                setViewportFeatures(response.features || [], response.total || 0, Boolean(response.truncated));
                const previousMetrics = useDesignSync.getState().renderMetrics;
                if (previousMetrics) {
                    setRenderMetrics({
                        ...previousMetrics,
                        viewportQueryMs: now() - queryStart,
                    });
                }
            })
            .catch(error => {
                if (requestId !== requestRef.current) return;
                console.warn('[MapLibreFastRenderer] Failed to query viewport features:', error);
                setViewportFeatures([], 0, false);
            })
            .finally(() => {
                if (requestId === requestRef.current) setViewportLoading(false);
            });
    }, [isLargeProject, mapHiddenIds, mapRevision, projectId, setRenderMetrics, setViewportFeatures, setViewportLoading, viewportFeatureLimit, viewportTick]);

    React.useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        if (lastBasemapTilesKeyRef.current === basemapTilesKey) return;
        lastBasemapTilesKeyRef.current = basemapTilesKey;
        if (!updateRasterSourceTiles(map, BASEMAP_SOURCE_ID, basemapTiles)) {
            console.warn('[MapLibreFastRenderer] Basemap source does not support tile updates.');
        }
    }, [basemapTiles, basemapTilesKey]);

    React.useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.getSource(SOURCE_ID)) return;
        const previousSelected = selectedFeatureRef.current;
        if (previousSelected && previousSelected !== selectedFeatureId) {
            map.setFeatureState({ source: SOURCE_ID, id: previousSelected }, { selected: false });
        }
        if (selectedFeatureId) {
            map.setFeatureState({ source: SOURCE_ID, id: selectedFeatureId }, { selected: true });
        }
        selectedFeatureRef.current = selectedFeatureId;
    }, [selectedFeatureId, viewportRevision]);

    React.useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const render = () => {
            const frameStart = now();
            const sourceStart = now();
            const { collection, lodPolicy } = buildMapLibreFeatureCollection({
                features: renderFeatureValues,
                selectedFeatureId,
                hiddenIds: mapHiddenIds,
                zoom: currentZoom,
                featureGroups,
                featureNumberMap,
                groupThemePreview,
            });
            const sourceBuildMs = now() - sourceStart;

            const applyData = () => {
                ensureDesignLayers(map, lodPolicy.clusterPoints, lodPolicy.showLabels);
                ensureOverlayLayers(map);
                ensurePointImages(map, collection);
                const setDataStart = now();
                const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
                source?.setData(collection as any);
                if (selectedFeatureId && source) {
                    map.setFeatureState({ source: SOURCE_ID, id: selectedFeatureId }, { selected: true });
                    selectedFeatureRef.current = selectedFeatureId;
                }
                const mapLibreSetDataMs = now() - setDataStart;
                const newMetrics = buildRenderMetrics({
                    engine: 'maplibre-fast',
                    lodLevel: lodPolicy.level,
                    featureCount: collection.features.length,
                    sourceBuildMs,
                    mapLibreSetDataMs,
                    frameMs: now() - frameStart,
                });
                const currentMetrics = useDesignSync.getState().renderMetrics;
                if (!currentMetrics || currentMetrics.featureCount !== newMetrics.featureCount || currentMetrics.lodLevel !== newMetrics.lodLevel) {
                    requestAnimationFrame(() => {
                        setRenderMetrics(newMetrics);
                    });
                }
            };

            if (map.isStyleLoaded()) {
                applyData();
            } else {
                map.once('styledata', applyData);
            }
        };

        render();
    }, [currentZoom, featureGroups, featureNumberMap, groupThemePreview, mapHiddenIds, renderFeatureValues, selectedFeatureId, setRenderMetrics, viewportRevision]);

    React.useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const applyData = () => {
            ensureOverlayLayers(map);
            setGeoJsonData(map, DRAWING_SOURCE_ID, buildDrawingOverlay(currentDrawingPoints, snappedPoint));
            setGeoJsonData(map, EDIT_SOURCE_ID, buildEditOverlay(editCoords, polylineSnapMarkers));
        };

        if (map.isStyleLoaded()) {
            applyData();
        } else {
            map.once('styledata', applyData);
        }
    }, [currentDrawingPoints, editCoords, polylineSnapMarkers, snappedPoint]);

    React.useEffect(() => {
        const map = mapRef.current;
        if (!map || !zoomToTrigger) return;
        const feature = (features as any)[zoomToTrigger.id] || (rawFeatures as any)[zoomToTrigger.id];
        const bbox = feature?.bbox;
        if (bbox) {
            map.fitBounds(
                [
                    [bbox.min_x, bbox.min_y],
                    [bbox.max_x, bbox.max_y],
                ],
                { padding: 80, maxZoom: 20, duration: 250 }
            );
            return;
        }
        const coordinates = Array.isArray(zoomToTrigger.location)
            ? [zoomToTrigger.location[1], zoomToTrigger.location[0]]
            : null;
        if (coordinates) map.flyTo({ center: coordinates as [number, number], zoom: Math.max(map.getZoom(), 19), duration: 250 });
    }, [features, rawFeatures, zoomToTrigger]);

    return <div ref={containerRef} className="design-maplibre-fast" data-testid="maplibre-fast-renderer" />;
}
