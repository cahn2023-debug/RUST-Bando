import React from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useShallow } from 'zustand/react/shallow';
import { useDesignSync, EMPTY_OBJ } from '@IMPLEMENT/stores/useDesignSync';
import { useFeatureNumbering } from '@IMPLEMENT/hooks/useDesignFeatures';
import { useLayoutStore } from '@IMPLEMENT/stores/useLayoutStore';
import { useSnap } from '@IMPLEMENT/hooks/useSnap';
import { queryVisibleFeaturesV2 } from '@TOOL/utils/designIpc';
import { confirmUserAction } from '@TOOL/utils/userConfirmation';
import { getParsedCoordinates, getParsedMetadata } from '@TOOL/utils/featureUtils';
import { useMapStyles, type MapBasemapPreset } from './useMapStyles';
import { buildMapLibreFeatureCollection, getMapLibreLodPolicy } from './mapLibreFastAdapter';
import { MAP_INTERSECTION_CHILD_MIN_ZOOM, MAP_POINT_CLUSTER_HIDE_AT_ZOOM, MAP_POINT_CLUSTER_MAX_ZOOM } from './mapDisplayPolicy';
import { buildRenderMetrics } from './mapRenderMetrics';
import { getIconSvgString } from '@DESIGN/components/icons/MapIcons';
import { buildPolylineSnapMarkers, type PolylineSnapMarker } from './polylineSnapMarkers';
import type { FeatureState } from '@CONTRACT/types';
import type { MapLibreFastFeatureCollection, MapLibreRenderFeatureCollection } from './mapLibreFastTypes';
import { useMapContext } from './MapContext';
import { useBasemap } from '@/core/basemap';
import { getRenderableFeatureById } from './featureLookup';
import { CameraBridge, DirtyFlag, FeatureOverlayCanvas, resolveMapRenderFlags, type FeatureOverlayCanvasHandle, type MapRenderFlags } from './render';
import { saveBootstrapMetadata } from './bootstrapMetadata';
import { markMapStartup, resetTelemetry } from './mapStartupTelemetry';
import { FIRST_BATCH_SIZE, renderFeaturesBatched, type BatchProgress } from './progressiveRender';

const SOURCE_ID = 'design-fast-features';
const POINT_CLUSTER_SOURCE_ID = 'design-fast-point-clusters-source';
const BASEMAP_SOURCE_ID = 'basemap';
const CAMERA_BRIDGE_LAYER_ID = 'design-camera-bridge';
const BASEMAP_HEAT_LAYER_ID = 'basemap-heat-overlay';
const POINT_GLOW_LAYER_ID = 'design-fast-points-glow';
const POINT_LAYER_ID = 'design-fast-points';
const POINT_ICON_LAYER_ID = 'design-fast-point-icons';
const POINT_LABEL_LAYER_ID = 'design-fast-point-labels';
const POINT_CLUSTER_LAYER_ID = 'design-fast-point-clusters';
const POINT_CLUSTER_COUNT_LAYER_ID = 'design-fast-point-cluster-counts';
const LINE_HIT_LAYER_ID = 'design-fast-line-hit-area';
const LINE_GLOW_LAYER_ID = 'design-fast-lines-glow';
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
const BASEMAP_RETRY_DELAYS_MS = [1000, 3000] as const;
const POINT_GEOMETRY_FILTER = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false] as unknown as maplibregl.FilterSpecification;
const LINE_GEOMETRY_FILTER = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false] as unknown as maplibregl.FilterSpecification;
const POLYGON_GEOMETRY_FILTER = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false] as unknown as maplibregl.FilterSpecification;

export type BasemapLoadState = 'initializing' | 'ready' | 'degraded' | 'offline';

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

type BootstrapBounds = {
    south?: number | null;
    north?: number | null;
    west?: number | null;
    east?: number | null;
} | null | undefined;

const getValidBootstrapBounds = (bounds: BootstrapBounds): [[number, number], [number, number]] | null => {
    if (!bounds) return null;
    const west = Number(bounds.west);
    const south = Number(bounds.south);
    const east = Number(bounds.east);
    const north = Number(bounds.north);
    if (![west, south, east, north].every(Number.isFinite)) return null;
    if (west < -180 || east > 180 || south < -90 || north > 90) return null;
    if (west >= east || south >= north) return null;
    return [[west, south], [east, north]];
};

const resolveInteractiveFeatureId = (properties: Record<string, any> | undefined | null) => {
    const parentFeatureId = properties?.parentFeatureId;
    if (typeof parentFeatureId === 'string' && parentFeatureId) return parentFeatureId;
    const id = properties?.id;
    return typeof id === 'string' ? id : null;
};

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
            id: 'neutral-background',
            type: 'background',
            paint: {
                'background-color': '#e5e7eb',
            },
        },
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
const MAX_ICON_LOADS_PER_RENDER = 96;
const imageCache = new Map<string, Promise<MapLibreImageData>>();
const imageLoadInFlight = new Set<string>();
const REPORT_CAPTURE_EVENT = 'design-report-map-capture';

type ReportCaptureScope = {
    active: boolean;
    focusFeatureIds?: string[];
    hiddenFeatureIds?: string[];
    requiredFeatureIds?: string[];
    captureKind?: 'preview' | 'export';
};

export const clearMapImageCache = () => {
    imageCache.clear();
    imageLoadInFlight.clear();
};

const escapeSvgText = (value: unknown) => (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '')
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
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load SVG image'));
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

const preparePointImages = (
    map: maplibregl.Map,
    collection: MapLibreRenderFeatureCollection,
    onImageReady: (imageId: string, image: MapLibreImageData, preloadMs: number) => void
): MapLibreRenderFeatureCollection => {
    const missingIconMap = new Map<string, Record<string, any>>();
    for (let index = 0; index < collection.features.length; index += 1) {
        const properties = collection.features[index].properties as Record<string, any>;
        const imageId = properties?.iconImageId;
        if (imageId && !map.hasImage(imageId)) {
            if (!missingIconMap.has(imageId)) {
                missingIconMap.set(imageId, properties);
            }
        }
    }

    if (missingIconMap.size === 0) return collection;

    const nextFeatures = collection.features.map(feature => {
        const imageId = (feature.properties as Record<string, any>)?.iconImageId;
        if (imageId && missingIconMap.has(imageId)) {
            return {
                ...feature,
                properties: {
                    ...feature.properties,
                    iconImageId: '',
                },
            };
        }
        return feature;
    });

    const nextCollection: MapLibreRenderFeatureCollection = {
        ...collection,
        features: nextFeatures,
    };

    let scheduledLoads = 0;
    for (const [imageId, properties] of missingIconMap) {
        if (imageLoadInFlight.has(imageId)) continue;
        if (scheduledLoads >= MAX_ICON_LOADS_PER_RENDER) break;
        scheduledLoads += 1;
        imageLoadInFlight.add(imageId);
        const svg = iconSvgForFeature(properties);
        const preloadStart = now();
        void loadSvgImage(imageId, svg)
            .then(image => {
                imageLoadInFlight.delete(imageId);
                onImageReady(imageId, image, now() - preloadStart);
            })
            .catch(error => {
                imageLoadInFlight.delete(imageId);
                console.warn('[MapLibreFastRenderer] Failed to load point icon:', imageId, error);
            });
    }

    return nextCollection;
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

const setMapGesturesEnabled = (map: maplibregl.Map, enabled: boolean) => {
    const gestureKeys = ['dragPan', 'scrollZoom', 'doubleClickZoom', 'touchZoomRotate'] as const;
    gestureKeys.forEach(key => {
        const handler = (map as any)[key];
        const method = enabled ? handler?.enable : handler?.disable;
        if (typeof method === 'function') method.call(handler);
    });
};

const stableJsonKey = (value: unknown) => {
    if (!value) return '';
    try {
        return JSON.stringify(value);
    } catch {
        return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
    }
};

const setKey = (ids: Set<string> | undefined | null) => {
    if (!ids || ids.size === 0) return '';
    return Array.from(ids).sort().join('|');
};

const selectedFeatureIdsForCollection = (
    collection: MapLibreRenderFeatureCollection,
    selectedFeatureId: string | null
) => {
    const nextSelected = new Set<string>();
    if (!selectedFeatureId) return nextSelected;

    for (const feature of collection.features) {
        const properties = feature.properties as Record<string, any>;
        if (properties.id === selectedFeatureId || properties.parentFeatureId === selectedFeatureId) {
            nextSelected.add(String(properties.id));
        }
    }
    if (nextSelected.size === 0) nextSelected.add(selectedFeatureId);
    return nextSelected;
};

const withoutPointFeatures = (
    collection: MapLibreRenderFeatureCollection
): MapLibreRenderFeatureCollection => ({
    ...collection,
    features: collection.features.filter(feature => (
        feature.geometry.type !== 'Point' && feature.geometry.type !== 'MultiPoint'
    )),
});

const onlyPointFeatures = (
    collection: MapLibreRenderFeatureCollection
): MapLibreRenderFeatureCollection => ({
    ...collection,
    features: collection.features.filter(feature => {
        const isPointGeom = feature.geometry.type === 'Point' || feature.geometry.type === 'MultiPoint';
        const props = feature.properties as Record<string, any> | undefined;
        const isLine = props?.geomType === 'line';
        const isIntersectionChild = Boolean(props?.isIntersectionChild);
        return isPointGeom && !isLine && !isIntersectionChild;
    }),
});

const getCoordsHash = (coords: any): number => {
    if (!coords) return 0;
    if (typeof coords === 'number') return coords;
    if (typeof coords === 'string') {
        let h = 0;
        for (let i = 0; i < coords.length; i++) h = (h + coords.charCodeAt(i)) | 0;
        return h;
    }
    if (Array.isArray(coords)) {
        if (coords.length === 0) return 0;
        const first = coords[0];
        const last = coords[coords.length - 1];
        return (coords.length + getCoordsHash(first) + getCoordsHash(last)) | 0;
    }
    if (typeof coords === 'object') {
        const x = coords.x ?? coords.lng ?? coords.longitude ?? coords.Longitude;
        const y = coords.y ?? coords.lat ?? coords.latitude ?? coords.Latitude;
        if (typeof x === 'number' && typeof y === 'number') {
            return (x + y) | 0;
        }
        const pts = coords.points ?? coords.coordinates ?? coords.coords;
        if (pts) return getCoordsHash(pts);
    }
    return 0;
};

const getMetadataHash = (meta: any): number => {
    if (!meta) return 0;
    if (typeof meta === 'string') {
        let h = 0;
        for (let i = 0; i < meta.length; i++) h = (h + meta.charCodeAt(i)) | 0;
        return h;
    }
    if (typeof meta === 'object') {
        const color = meta.color ?? meta.gis?.color ?? meta.stroke ?? meta.gis?.stroke;
        const size = meta.size ?? meta.gis?.size ?? meta.weight ?? meta.gis?.weight;
        let h = 0;
        if (typeof color === 'string') {
            for (let i = 0; i < color.length; i++) h = (h + color.charCodeAt(i)) | 0;
        }
        if (typeof size === 'number') {
            h = (h + size) | 0;
        }
        return h;
    }
    return 0;
};

const getPropertiesHash = (props: any): number => {
    if (!props) return 0;
    if (typeof props === 'object') {
        const color = props.color ?? props.stroke;
        const size = props.size ?? props.weight;
        let h = 0;
        if (typeof color === 'string') {
            for (let i = 0; i < color.length; i++) h = (h + color.charCodeAt(i)) | 0;
        }
        if (typeof size === 'number') {
            h = (h + size) | 0;
        }
        return h;
    }
    return 0;
};

const featureListKey = (features: FeatureState[], mapRevision: number, viewportRevision: number) => {
    const len = features.length;
    if (len === 0) return `${mapRevision}:${viewportRevision}:0`;
    const f0 = features[0];
    const fLast = features[len - 1];
    const sampleHash = (getCoordsHash(f0?.coordinates) + getCoordsHash(fLast?.coordinates)) | 0;
    return `${mapRevision}:${viewportRevision}:${len}:${sampleHash}`;
};

const featureGroupsKey = (featureGroups: Record<string, any>) => Object.keys(featureGroups || {})
    .sort()
    .map(id => {
        const group = featureGroups[id];
        return `${id}:${group?.is_visible ?? ''}:${group?.layer_id ?? ''}:${group?.type ?? ''}:${group?.name ?? ''}`;
    })
    .join('|');

const featureNumberKey = (featureNumberMap: Record<string, string | number>) => Object.keys(featureNumberMap || {})
    .sort()
    .map(id => `${id}:${featureNumberMap[id]}`)
    .join('|');

const quantizeZoomBucket = (zoom: number) => {
    if (zoom < 15) return 14;
    if (zoom < 17) return 16;
    if (zoom < 19) return 18;
    return 20;
};

const renderZoomForLodBucket = (zoom: number, featureCount: number) => {
    const quantized = quantizeZoomBucket(zoom);
    const policy = getMapLibreLodPolicy({ zoom: quantized, featureCount });
    if (policy.level === 'summary') return 14;
    if (policy.level === 'detail') return policy.showLabels ? 18 : 16;
    return 20;
};

const addMapLayer = (map: maplibregl.Map, layer: maplibregl.AddLayerObject, beforeId?: string) => {
    map.addLayer(layer, beforeId);
};

const ensureBasemapOverlayLayers = (map: maplibregl.Map, preset?: MapBasemapPreset | null) => {
    if (!map.getSource(SOURCE_ID)) return;

    if (!map.getLayer(BASEMAP_HEAT_LAYER_ID)) {
        addMapLayer(map, {
            id: BASEMAP_HEAT_LAYER_ID,
            type: 'heatmap',
            source: SOURCE_ID,
            filter: ['all', POINT_GEOMETRY_FILTER, ['!', ['has', 'point_count']]] as unknown as maplibregl.FilterSpecification,
            layout: {
                visibility: preset?.kind === 'heat' ? 'visible' : 'none',
            },
            paint: {
                'heatmap-weight': [
                    'interpolate',
                    ['linear'],
                    ['coalesce', ['get', 'size'], 10],
                    6,
                    0.35,
                    24,
                    1,
                ],
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.75, 18, 1.8],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 18, 34],
                'heatmap-opacity': preset?.kind === 'heat' ? 0.72 : 0,
                'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0,
                    'rgba(15, 23, 42, 0)',
                    0.2,
                    '#22d3ee',
                    0.45,
                    '#84cc16',
                    0.7,
                    '#facc15',
                    1,
                    '#ef4444',
                ],
            },
        } as maplibregl.AddLayerObject, map.getLayer(POLYGON_LAYER_ID) ? POLYGON_LAYER_ID : undefined);
    }

    map.setLayoutProperty(BASEMAP_HEAT_LAYER_ID, 'visibility', preset?.kind === 'heat' ? 'visible' : 'none');
    if (typeof (map as any).setPaintProperty === 'function') {
        (map as any).setPaintProperty(BASEMAP_HEAT_LAYER_ID, 'heatmap-opacity', preset?.kind === 'heat' ? 0.72 : 0);
    }
};

const ensureCameraBridgeLayer = (
    map: maplibregl.Map,
    cameraBridge: CameraBridge,
    scheduleOverlay: (dirty: DirtyFlag) => void
) => {
    if (map.getLayer(CAMERA_BRIDGE_LAYER_ID)) return;

    const publish = (matrixLike: unknown) => {
        const mapCanvas = map.getCanvas();
        const matrix = matrixLike instanceof Float32Array
            ? matrixLike
            : Array.isArray(matrixLike)
                ? new Float32Array(matrixLike as number[])
                : new Float32Array(16);
        cameraBridge.publish({
            matrix,
            width: mapCanvas.width,
            height: mapCanvas.height,
            pixelRatio: window.devicePixelRatio || 1,
        });
        scheduleOverlay(DirtyFlag.Camera);
    };

    map.addLayer({
        id: CAMERA_BRIDGE_LAYER_ID,
        type: 'custom',
        renderingMode: '2d',
        render: (_gl: WebGLRenderingContext | WebGL2RenderingContext, matrix: unknown) => {
            publish(matrix);
        },
    } as maplibregl.CustomLayerInterface);
};

const ensureDesignLayers = (map: maplibregl.Map, clusterPoints: boolean, showLabels: boolean) => {
    if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
            type: 'geojson',
            data: emptyCollection as any,
            promoteId: 'id',
        });
    }

    if (!map.getSource(POINT_CLUSTER_SOURCE_ID)) {
        map.addSource(POINT_CLUSTER_SOURCE_ID, {
            type: 'geojson',
            data: emptyCollection as any,
            promoteId: 'id',
            cluster: true,
            clusterRadius: 48,
            clusterMaxZoom: MAP_POINT_CLUSTER_MAX_ZOOM,
        });
    }

    if (!map.getLayer(POLYGON_LAYER_ID)) {
        addMapLayer(map, {
            id: POLYGON_LAYER_ID,
            type: 'fill',
            source: SOURCE_ID,
            filter: POLYGON_GEOMETRY_FILTER,
            paint: {
                'fill-color': ['get', 'color'],
                'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.42, 0.18],
            },
        } as maplibregl.AddLayerObject);
    }

    if (!map.getLayer(POLYGON_STROKE_LAYER_ID)) {
        addMapLayer(map, {
            id: POLYGON_STROKE_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            filter: POLYGON_GEOMETRY_FILTER,
            paint: {
                'line-color': ['get', 'color'],
                'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 4, 1.5],
                'line-opacity': 0.9,
            },
        } as maplibregl.AddLayerObject);
    }

    if (!map.getLayer(LINE_HIT_LAYER_ID)) {
        addMapLayer(map, {
            id: LINE_HIT_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            filter: LINE_GEOMETRY_FILTER,
            paint: {
                'line-color': '#000000',
                'line-width': ['max', 18, ['+', ['get', 'size'], 10]],
                'line-opacity': 0.01,
            },
            layout: {
                'line-cap': 'round',
                'line-join': 'round',
            },
        } as maplibregl.AddLayerObject);
    }

    if (!map.getLayer(LINE_GLOW_LAYER_ID)) {
        addMapLayer(map, {
            id: LINE_GLOW_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            filter: LINE_GEOMETRY_FILTER,
            paint: {
                'line-color': ['get', 'color'],
                'line-width': ['+', ['get', 'size'], 8],
                'line-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false],
                    0.4,
                    ['boolean', ['feature-state', 'hover'], false],
                    0.25,
                    0
                ],
                'line-blur': 4,
            },
            layout: {
                'line-cap': 'round',
                'line-join': 'round',
            },
        } as maplibregl.AddLayerObject);
    }

    if (!map.getLayer(LINE_LAYER_ID)) {
        addMapLayer(map, {
            id: LINE_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            filter: LINE_GEOMETRY_FILTER,
            paint: {
                'line-color': ['get', 'color'],
                'line-width': ['max', 2, ['coalesce', ['get', 'size'], 3]],
                'line-dasharray': ['case', ['has', 'dashArray'], ['get', 'dashArray'], ['literal', [1, 0]]],
                'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.98, 0.74],
            },
            layout: {
                'line-cap': 'round',
                'line-join': 'round',
            },
        } as maplibregl.AddLayerObject);
    }

    if (!map.getLayer(POINT_CLUSTER_LAYER_ID)) {
        addMapLayer(map, {
            id: POINT_CLUSTER_LAYER_ID,
            type: 'circle',
            source: POINT_CLUSTER_SOURCE_ID,
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': '#0f766e',
                'circle-radius': ['step', ['get', 'point_count'], 16, 100, 22, 1000, 30],
                'circle-opacity': 0.82,
                'circle-stroke-color': '#ecfeff',
                'circle-stroke-width': 1,
            },
        } as maplibregl.AddLayerObject);
    }

    if (!map.getLayer(POINT_CLUSTER_COUNT_LAYER_ID)) {
        addMapLayer(map, {
            id: POINT_CLUSTER_COUNT_LAYER_ID,
            type: 'symbol',
            source: POINT_CLUSTER_SOURCE_ID,
            filter: ['has', 'point_count'],
            layout: {
                'text-field': ['get', 'point_count_abbreviated'],
                'text-size': 12,
                'text-allow-overlap': true,
                'text-ignore-placement': true,
            },
            paint: {
                'text-color': '#ecfeff',
                'text-halo-color': '#0f172a',
                'text-halo-width': 1,
            },
        } as maplibregl.AddLayerObject);
    }

    if (!map.getLayer(POINT_GLOW_LAYER_ID)) {
        addMapLayer(map, {
            id: POINT_GLOW_LAYER_ID,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['all', POINT_GEOMETRY_FILTER, ['!', ['has', 'point_count']]] as unknown as maplibregl.FilterSpecification,
            paint: {
                'circle-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#22d3ee', ['get', 'color']],
                'circle-radius': [
                    'case',
                    ['to-boolean', ['get', 'iconImageId']],
                    ['case',
                        ['boolean', ['feature-state', 'selected'], false],
                        ['+', ['/', ['get', 'displaySize'], 2], 5],
                        ['boolean', ['feature-state', 'hover'], false],
                        ['+', ['/', ['get', 'displaySize'], 2], 3],
                        0
                    ],
                    ['case',
                        ['boolean', ['feature-state', 'selected'], false],
                        ['+', ['/', ['get', 'displaySize'], 2], 4],
                        ['boolean', ['feature-state', 'hover'], false],
                        ['+', ['/', ['get', 'displaySize'], 2], 2],
                        0
                    ]
                ],
                'circle-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false],
                    0.35,
                    ['boolean', ['feature-state', 'hover'], false],
                    0.2,
                    0
                ],
                'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#22d3ee', '#ffffff'],
                'circle-stroke-width': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false],
                    2.5,
                    ['boolean', ['feature-state', 'hover'], false],
                    1.5,
                    0
                ],
            },
        } as maplibregl.AddLayerObject);
    }

    if (!map.getLayer(POINT_LAYER_ID)) {
        addMapLayer(map, {
            id: POINT_LAYER_ID,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['all', POINT_GEOMETRY_FILTER, ['!', ['has', 'point_count']]] as unknown as maplibregl.FilterSpecification,
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
        } as maplibregl.AddLayerObject);
    }

    if (!map.getLayer(POINT_ICON_LAYER_ID)) {
        addMapLayer(map, {
            id: POINT_ICON_LAYER_ID,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['all', POINT_GEOMETRY_FILTER, ['!', ['has', 'point_count']], ['to-boolean', ['get', 'iconImageId']]] as unknown as maplibregl.FilterSpecification,
            layout: {
                'icon-image': ['get', 'iconImageId'],
                'icon-size': 1,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
            },
        } as maplibregl.AddLayerObject);
    }

    if (!map.getLayer(POINT_LABEL_LAYER_ID)) {
        addMapLayer(map, {
            id: POINT_LABEL_LAYER_ID,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['all', POINT_GEOMETRY_FILTER, ['!', ['has', 'point_count']], ['!', ['to-boolean', ['get', 'iconImageId']]]] as unknown as maplibregl.FilterSpecification,
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
        } as maplibregl.AddLayerObject);
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
    map.setLayoutProperty(POINT_CLUSTER_COUNT_LAYER_ID, 'visibility', clusterPoints ? 'visible' : 'none');
    map.setLayoutProperty(LABEL_LAYER_ID, 'visibility', showLabels ? 'visible' : 'none');
    [
        POLYGON_LAYER_ID,
        POLYGON_STROKE_LAYER_ID,
        LINE_HIT_LAYER_ID,
        LINE_GLOW_LAYER_ID,
        LINE_LAYER_ID,
        POINT_CLUSTER_LAYER_ID,
        POINT_CLUSTER_COUNT_LAYER_ID,
        POINT_GLOW_LAYER_ID,
        POINT_LAYER_ID,
        POINT_ICON_LAYER_ID,
        POINT_LABEL_LAYER_ID,
        LABEL_LAYER_ID,
    ].forEach(layerId => moveLayerToTop(map, layerId));
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

const DESIGN_LAYER_IDS = [
    BASEMAP_HEAT_LAYER_ID,
    CAMERA_BRIDGE_LAYER_ID,
    POLYGON_LAYER_ID,
    POLYGON_STROKE_LAYER_ID,
    LINE_HIT_LAYER_ID,
    LINE_GLOW_LAYER_ID,
    LINE_LAYER_ID,
    POINT_CLUSTER_LAYER_ID,
    POINT_CLUSTER_COUNT_LAYER_ID,
    POINT_GLOW_LAYER_ID,
    POINT_LAYER_ID,
    POINT_ICON_LAYER_ID,
    POINT_LABEL_LAYER_ID,
    LABEL_LAYER_ID,
    DRAWING_LINE_LAYER_ID,
    DRAWING_VERTEX_LAYER_ID,
    SNAP_LAYER_ID,
    EDIT_VERTEX_LAYER_ID,
    EDIT_MIDPOINT_LAYER_ID,
    EDIT_SNAP_LINK_LAYER_ID,
] as const;

const DESIGN_SOURCE_IDS = [
    SOURCE_ID,
    POINT_CLUSTER_SOURCE_ID,
    DRAWING_SOURCE_ID,
    EDIT_SOURCE_ID,
] as const;

const cleanupDesignMapArtifacts = (map: maplibregl.Map) => {
    for (const layerId of DESIGN_LAYER_IDS) {
        try {
            if (map.getLayer(layerId)) map.removeLayer(layerId);
        } catch {
            // MapLibre may be mid-style transition.
        }
    }
    for (const sourceId of DESIGN_SOURCE_IDS) {
        try {
            if (map.getSource(sourceId)) map.removeSource(sourceId);
        } catch {
            // MapLibre may be mid-style transition.
        }
    }
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
    basemapPreset: basemapPresetProp,
    renderFlags: renderFlagsProp,
    onFirstFrameRendered,
}: {
    center: [number, number];
    zoom: number;
    onLocationChange?: (lat: number, lng: number, snapId?: string | null) => void;
    onFinishDrawing?: () => void;
    onFinishDrawingSession?: () => void;
    isMeasureActive?: boolean;
    basemapTiles?: string[];
    basemapKey?: string;
    basemapPreset?: MapBasemapPreset;
    renderFlags?: Partial<MapRenderFlags> | null;
    onFirstFrameRendered?: () => void;
}) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const overlayRef = React.useRef<FeatureOverlayCanvasHandle | null>(null);
    const cameraBridgeRef = React.useRef(new CameraBridge());
    const mapRef = React.useRef<maplibregl.Map | null>(null);
    let contextMap: maplibregl.Map | null = null;
    let setMap: (map: maplibregl.Map | null) => void = () => {};
    try {
        const mapContext = useMapContext();
        contextMap = mapContext.map;
        setMap = mapContext.setMap;
    } catch {
        // MapProvider optional
    }
    let basemapController = null;
    try {
        basemapController = useBasemap().controller;
    } catch {
        // BasemapProvider optional
    }
    const shouldUsePersistentBasemap = Boolean(basemapController);
    const requestRef = React.useRef(0);
    const lastBasemapTilesKeyRef = React.useRef<string | null>(null);
    const selectedFeatureRef = React.useRef<Set<string>>(new Set());
    const hoveredFeatureRef = React.useRef<string | null>(null);
    const layerSetupKeyRef = React.useRef<string | null>(null);
    const lastSetDataKeyRef = React.useRef<string | null>(null);
    const lastClusterSetDataKeyRef = React.useRef<string | null>(null);
    const snapRafRef = React.useRef(0);
    const pendingSnapEventRef = React.useRef<any>(null);
    const iconReadyRafRef = React.useRef(0);
    const featureStateRevisionRef = React.useRef(0);
    const pendingIconPreloadMsRef = React.useRef<number | null>(null);
    const basemapRetryTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
    const basemapRetryAttemptRef = React.useRef(0);
    const fittedBootstrapBoundsKeyRef = React.useRef<string | null>(null);
    // Combined selector 1: fields used in rendering geometry
    const renderSlice = useDesignSync(useShallow((s) => ({
        features: s.visibleFeatures,
        rawFeatures: s.state?.features || (EMPTY_OBJ as Record<string, FeatureState>),
        featureDetailsCache: s.featureDetailsCache,
        mapState: s.state,
        isLargeProject: Boolean(s.state?.isLargeProject),
        featureGroups: s.state?.feature_groups || (EMPTY_OBJ as Record<string, any>),
        selectedFeatureId: s.selectedFeatureId,
        hoverId: s.hoverId,
        groupThemePreview: s.groupThemePreview,
        showFeatureGroups: s.showFeatureGroups,
        mapRevision: s.state?.mapRevision || 0,
        initialBounds: s.state?.initialBounds as BootstrapBounds,
        viewportRevision: s.viewportRevision,
        viewportFeatureLimit: s.state?.viewportFeatureLimit || 10000,
    })));

    // Combined selector 2: fields for edit/draw UI
    const editSlice = useDesignSync(useShallow((s) => ({
        editingFeatureId: s.editingFeatureId,
        drawingMode: s.drawingMode,
        currentDrawingPoints: s.currentDrawingPoints,
        snappedPoint: s.snappedPoint,
    })));

    // Combined selector 3: viewport/UI fields
    const uiSlice = useDesignSync(useShallow((s) => ({
        projectId: s.projectId,
        zoomToTrigger: s.zoomToTrigger,
        mapHiddenIds: s.mapHiddenIds,
    })));

    // Stable action selectors (Zustand actions are stable references — no useShallow needed)
    const selectFeature = useDesignSync(s => s.selectFeature);
    const setHoverId = useDesignSync(s => s.setHoverId);
    const setDrawingPoint = useDesignSync(s => s.setDrawingPoint);
    const insertDrawingPoint = useDesignSync(s => s.insertDrawingPoint);
    const zoomTo = useDesignSync(s => s.zoomTo);
    const setViewportFeatures = useDesignSync(s => s.setViewportFeatures);
    const setViewportLoading = useDesignSync(s => s.setViewportLoading);
    const setRenderMetrics = useDesignSync(s => s.setRenderMetrics);
    const updateOpenMetrics = useDesignSync(s => s.updateOpenMetrics);

    // Destructure slices for use throughout the component
    const { features, rawFeatures, featureDetailsCache, mapState, isLargeProject, featureGroups,
        selectedFeatureId, hoverId, groupThemePreview, showFeatureGroups,
        mapRevision, initialBounds, viewportRevision, viewportFeatureLimit } = renderSlice;
    const { editingFeatureId, drawingMode, currentDrawingPoints, snappedPoint } = editSlice;
    const { projectId, zoomToTrigger, mapHiddenIds } = uiSlice;
    const { performSnap, snapNow, clearSnap, snappedPointRef } = useSnap();
    const { getStyledTiles: getFallbackStyledTiles, mapKey: fallbackMapKey, activeBasemapPreset: fallbackBasemapPreset } = useMapStyles();
    const basemapTiles = React.useMemo(
        () => basemapTilesProp || getFallbackStyledTiles(),
        [basemapKey, basemapTilesProp, fallbackMapKey, getFallbackStyledTiles]
    );
    const basemapTilesKey = React.useMemo(() => basemapKey || basemapTiles.join('|'), [basemapKey, basemapTiles]);
    const activeBasemapPreset = basemapPresetProp || fallbackBasemapPreset;
    const projectRenderFlags = (mapState?.settings as any)?.mapRenderFlags as Partial<MapRenderFlags> | undefined;
    const renderFlags = React.useMemo(
        () => resolveMapRenderFlags(renderFlagsProp || projectRenderFlags),
        [projectRenderFlags, renderFlagsProp]
    );
    const [currentZoom, setCurrentZoom] = React.useState(zoom);
    const [viewportTick, setViewportTick] = React.useState(0);
    const [iconReadyRevision, setIconReadyRevision] = React.useState(0);
    const [reportCaptureScope, setReportCaptureScope] = React.useState<ReportCaptureScope | null>(null);
    const [basemapLoadState, setBasemapLoadState] = React.useState<BasemapLoadState>(() => navigator.onLine === false ? 'offline' : 'initializing');
    const firstViewportQueryReportedRef = React.useRef(false);
    const firstSetDataReportedRef = React.useRef(false);
    const firstPaintReportedRef = React.useRef(false);
    const bindCompleteReportedRef = React.useRef(false);
    /** Cancellation token for the active progressive render chain. Increment to cancel previous chain. */
    const progressiveRenderEpochRef = React.useRef(0);
    /** Tracks progressive batch rendering progress exposed to the loading indicator. { rendered, total } (Task 4.5) */
    const [batchProgress, setBatchProgress] = React.useState<BatchProgress>({ rendered: 0, total: 0 });
    const pendingLoadedIconsRef = React.useRef<Map<string, { image: MapLibreImageData; preloadMs: number }>>(new Map());
    const preparedPointImagesRef = React.useRef<{
        collection: MapLibreRenderFeatureCollection;
        missingIconKey: string;
        displayCollection: MapLibreRenderFeatureCollection;
    } | null>(null);
    const renderFeatureValues = React.useMemo(
        () => Object.values(reportCaptureScope?.active ? rawFeatures : isLargeProject ? features : rawFeatures),
        [features, isLargeProject, rawFeatures, reportCaptureScope]
    );
    const reportCaptureFocusIds = React.useMemo(
        () => new Set(reportCaptureScope?.active ? reportCaptureScope.focusFeatureIds || [] : []),
        [reportCaptureScope]
    );
    const effectiveHiddenIds = React.useMemo(() => {
        const hidden = new Set(mapHiddenIds || []);
        if (reportCaptureScope?.active) {
            (reportCaptureScope.hiddenFeatureIds || []).forEach((id) => hidden.add(id));
        }
        return hidden;
    }, [mapHiddenIds, reportCaptureScope]);
    const renderFeatureRecord = React.useMemo(() => {
        const record: Record<string, FeatureState> = {};
        for (const feature of renderFeatureValues as FeatureState[]) {
            if (feature?.id) record[feature.id] = feature;
        }
        return record;
    }, [renderFeatureValues]);
    const featureNumberMap = useFeatureNumbering(renderFeatureRecord);
    const renderZoom = React.useMemo(
        () => renderZoomForLodBucket(currentZoom, renderFeatureValues.length),
        [currentZoom, renderFeatureValues.length]
    );
    const quantizedZoom = quantizeZoomBucket(currentZoom);
    const renderVisibilityPolicyKey = [
        quantizedZoom < MAP_POINT_CLUSTER_HIDE_AT_ZOOM ? 'cluster' : 'plain',
        quantizedZoom < MAP_INTERSECTION_CHILD_MIN_ZOOM ? 'hide-children' : 'show-children',
    ].join(':');
    const renderCacheKey = React.useMemo(() => [
        featureListKey(renderFeatureValues as FeatureState[], mapRevision, isLargeProject ? viewportRevision : 0),
        setKey(effectiveHiddenIds),
        setKey(reportCaptureFocusIds),
        renderZoom,
        renderVisibilityPolicyKey,
        featureGroupsKey(featureGroups),
        featureNumberKey(featureNumberMap),
        stableJsonKey(groupThemePreview),
    ].join('::'), [
        featureGroups,
        featureNumberMap,
        groupThemePreview,
        isLargeProject,
        effectiveHiddenIds,
        reportCaptureFocusIds,
        mapRevision,
        renderFeatureValues,
        renderVisibilityPolicyKey,
        renderZoom,
        viewportRevision,
    ]);
    const renderCollectionResult = React.useMemo(() => {
        const sourceStart = now();
        const result = buildMapLibreFeatureCollection({
            features: renderFeatureValues as FeatureState[],
            selectedFeatureId: null,
            focusIds: reportCaptureFocusIds,
            hiddenIds: effectiveHiddenIds,
            zoom: renderZoom,
            featureGroups,
            featureNumberMap,
            groupThemePreview,
        });
        // showFeatureGroups toggle controls whether clustering is active.
        // When disabled, force clusterPoints=false regardless of zoom level.
        const lodPolicy = showFeatureGroups
            ? result.lodPolicy
            : { ...result.lodPolicy, clusterPoints: false };
        return {
            ...result,
            lodPolicy,
            sourceBuildMs: now() - sourceStart,
        };
    }, [
        featureGroups,
        featureNumberMap,
        groupThemePreview,
        effectiveHiddenIds,
        reportCaptureFocusIds,
        renderCacheKey,
        renderZoom,
        showFeatureGroups,
    ]);
    const applySelectedFeatureState = React.useCallback((nextSelected: Set<string>) => {
        const map = mapRef.current;
        if (!map || !map.getSource(SOURCE_ID)) return;

        selectedFeatureRef.current.forEach(id => {
            try {
                map.setFeatureState({ source: SOURCE_ID, id }, { selected: false });
            } catch {
                // MapLibre may still be tearing down/rebuilding source state.
            }
        });
        nextSelected.forEach(id => {
            try {
                map.setFeatureState({ source: SOURCE_ID, id }, { selected: true });
            } catch {
                // MapLibre may still be tearing down/rebuilding source state.
            }
        });
        selectedFeatureRef.current = nextSelected;
    }, []);
    const scheduleSelectedFeatureState = React.useCallback((nextSelected: Set<string>, waitForSourceIdle: boolean) => {
        const map = mapRef.current;
        if (!map || !map.getSource(SOURCE_ID)) return;

        const revision = ++featureStateRevisionRef.current;
        let applied = false;
        const apply = () => {
            if (applied || revision !== featureStateRevisionRef.current || mapRef.current !== map) return;
            applied = true;
            applySelectedFeatureState(nextSelected);
        };

        if (waitForSourceIdle) {
            map.once('idle', apply);
            requestAnimationFrame(() => requestAnimationFrame(apply));
            return;
        }

        requestAnimationFrame(apply);
    }, [applySelectedFeatureState]);
    const applyHoverFeatureState = React.useCallback((nextHoverId: string | null) => {
        const map = mapRef.current;
        if (!map || !map.getSource(SOURCE_ID)) return;

        const prevHoverId = hoveredFeatureRef.current;
        if (prevHoverId === nextHoverId) return;

        if (prevHoverId) {
            try {
                map.setFeatureState({ source: SOURCE_ID, id: prevHoverId }, { hover: false });
            } catch {
                // MapLibre may still be tearing down/rebuilding source state.
            }
        }
        if (nextHoverId) {
            try {
                map.setFeatureState({ source: SOURCE_ID, id: nextHoverId }, { hover: true });
            } catch {
                // MapLibre may still be tearing down/rebuilding source state.
            }
        }
        hoveredFeatureRef.current = nextHoverId;
    }, []);
    const editingFeature = React.useMemo(
        () => getRenderableFeatureById(editingFeatureId, { state: mapState, visibleFeatures: features, featureDetailsCache }),
        [editingFeatureId, featureDetailsCache, features, mapState]
    );
    const selectedFeature = React.useMemo(
        () => getRenderableFeatureById(selectedFeatureId, { state: mapState, visibleFeatures: features, featureDetailsCache }),
        [featureDetailsCache, features, mapState, selectedFeatureId]
    );
    const snapFeatureRecord = React.useMemo(() => {
        const record: Record<string, FeatureState> = {
            ...(featureDetailsCache as Record<string, FeatureState>),
            ...(features as Record<string, FeatureState>),
            ...(rawFeatures as Record<string, FeatureState>),
        };
        if (selectedFeature?.id) record[selectedFeature.id] = selectedFeature;
        if (editingFeature?.id) record[editingFeature.id] = editingFeature;
        return record;
    }, [editingFeature, featureDetailsCache, features, rawFeatures, selectedFeature]);
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
        selectFeature,
        setHoverId,
        isMeasureActive,
        zoomTo,
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
            selectFeature,
            setHoverId,
            isMeasureActive,
            zoomTo,
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
        selectFeature,
        setHoverId,
        isMeasureActive,
        zoomTo,
    ]);

    React.useEffect(() => {
        const handleReportCapture = (event: Event) => {
            const detail = (event as CustomEvent<ReportCaptureScope>).detail;
            if (!detail?.active) {
                setReportCaptureScope(null);
                return;
            }
            setReportCaptureScope({
                active: true,
                focusFeatureIds: Array.isArray(detail.focusFeatureIds) ? detail.focusFeatureIds : [],
                hiddenFeatureIds: Array.isArray(detail.hiddenFeatureIds) ? detail.hiddenFeatureIds : [],
                requiredFeatureIds: Array.isArray(detail.requiredFeatureIds) ? detail.requiredFeatureIds : [],
                captureKind: detail.captureKind,
            });
        };
        window.addEventListener(REPORT_CAPTURE_EVENT, handleReportCapture);
        return () => {
            window.removeEventListener(REPORT_CAPTURE_EVENT, handleReportCapture);
        };
    }, []);

    React.useEffect(() => {
        if (mapRef.current) return;
        if (shouldUsePersistentBasemap && !contextMap) return;

        const ownsMap = !shouldUsePersistentBasemap;
        if (ownsMap && !containerRef.current) return;

        const map = contextMap || new maplibregl.Map({
            container: containerRef.current!,
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
        setMapGesturesEnabled(map, true);
        const scheduleOverlay = (dirty: DirtyFlag) => overlayRef.current?.schedule(dirty);
        const mapListenerCleanups: Array<() => void> = [];
        const onMap = (event: string, ...args: any[]) => {
            (map as any).on(event, ...args);
            mapListenerCleanups.push(() => {
                try {
                    (map as any).off?.(event, ...args);
                } catch {
                    // Ignore listener cleanup races during map teardown.
                }
            });
        };

        const resizeObserver = ownsMap && typeof ResizeObserver !== 'undefined' && containerRef.current
            ? new ResizeObserver(() => {
                map.resize();
            })
            : null;
        resizeObserver?.observe(containerRef.current!);

        if (!ownsMap) {
            markMapStartup("project-bind-start", { projectId });
            ensureCameraBridgeLayer(map, cameraBridgeRef.current, scheduleOverlay);
            setBasemapLoadState(navigator.onLine === false ? 'offline' : 'ready');
            setViewportTick(tick => tick + 1);
            scheduleOverlay(DirtyFlag.Camera | DirtyFlag.Geometry);
            onFirstFrameRendered?.();
        }

        map.once('render', () => {
            onFirstFrameRendered?.();
        });

        onMap('moveend', () => {
            const centerLngLat = map.getCenter();
            const currentZoomVal = map.getZoom();
            setCurrentZoom(currentZoomVal);
            setViewportTick(tick => tick + 1);
            scheduleOverlay(DirtyFlag.Camera);

            saveBootstrapMetadata({
                center: [centerLngLat.lng, centerLngLat.lat],
                zoom: currentZoomVal,
                bearing: map.getBearing(),
                pitch: map.getPitch(),
            });
        });
        map.once('load', () => {
            setBasemapLoadState(navigator.onLine === false ? 'offline' : 'ready');
            basemapRetryAttemptRef.current = 0;
            setViewportTick(tick => tick + 1);
            ensureCameraBridgeLayer(map, cameraBridgeRef.current, scheduleOverlay);
            scheduleOverlay(DirtyFlag.Camera | DirtyFlag.Geometry);
        });
        onMap('error', (event: any) => {
            const sourceId = event?.sourceId || event?.source?.id;
            if (sourceId && sourceId !== BASEMAP_SOURCE_ID) return;
            if (navigator.onLine === false) {
                setBasemapLoadState('offline');
                return;
            }
            setBasemapLoadState('degraded');
            const retryIndex = basemapRetryAttemptRef.current;
            const retryDelay = BASEMAP_RETRY_DELAYS_MS[retryIndex];
            if (retryDelay === undefined) return;
            basemapRetryAttemptRef.current += 1;
            const timer = setTimeout(() => {
                const source = map.getSource(BASEMAP_SOURCE_ID) as { reload?: () => void } | undefined;
                source?.reload?.();
            }, retryDelay);
            basemapRetryTimersRef.current.push(timer);
        });
        const handleOnline = () => {
            setBasemapLoadState('initializing');
            basemapRetryAttemptRef.current = 0;
            const source = map.getSource(BASEMAP_SOURCE_ID) as { reload?: () => void } | undefined;
            source?.reload?.();
        };
        const handleOffline = () => setBasemapLoadState('offline');
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        onMap('styleimagemissing', (e: any) => {
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

        onMap('click', POINT_CLUSTER_LAYER_ID, (event: any) => {
            const feature = event.features?.[0];
            const clusterId = feature?.properties?.cluster_id;
            const coordinates = feature?.geometry?.type === 'Point'
                ? (feature.geometry.coordinates as [number, number])
                : null;
            if (clusterId === undefined || !coordinates) return;

            const source = map.getSource(POINT_CLUSTER_SOURCE_ID) as any;
            const zoomToCluster = (expansionZoom: number) => {
                const targetZoom = Math.min(expansionZoom, MAP_MAX_ZOOM);
                const target = { center: coordinates, zoom: targetZoom, duration: 250 };
                if (typeof (map as any).easeTo === 'function') (map as any).easeTo(target);
                else map.flyTo(target);
            };

            const maybePromise = source?.getClusterExpansionZoom?.(clusterId, (error: unknown, expansionZoom: number) => {
                if (!error && Number.isFinite(expansionZoom)) zoomToCluster(expansionZoom);
            });
            if (maybePromise && typeof maybePromise.then === 'function') {
                maybePromise.then((expansionZoom: number) => {
                    if (Number.isFinite(expansionZoom)) zoomToCluster(expansionZoom);
                }).catch(() => {});
            }
        });
        onMap('mousemove', POINT_CLUSTER_LAYER_ID, () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        onMap('mouseleave', POINT_CLUSTER_LAYER_ID, () => {
            map.getCanvas().style.cursor = '';
        });

        const interactiveLayers = [POINT_LAYER_ID, POINT_ICON_LAYER_ID, POINT_LABEL_LAYER_ID, LINE_HIT_LAYER_ID, LINE_LAYER_ID, POLYGON_LAYER_ID];
        onMap('click', interactiveLayers, (event: any) => {
            const latest = latestRef.current;
            if (latest.drawingMode !== 'none') return;
            const feature = event.features?.[0];
            const id = resolveInteractiveFeatureId(feature?.properties as Record<string, any> | undefined);
            if (!id) return;
            const lngLat = event.lngLat;
            latest.selectFeature(id, false, [lngLat.lat, lngLat.lng]);
            // Zoom to the clicked feature so the object is brought into focus.
            latest.zoomTo(id, 'feature', [lngLat.lat, lngLat.lng]);
        });
        onMap('mousemove', interactiveLayers, (event: any) => {
            const id = resolveInteractiveFeatureId(event.features?.[0]?.properties as Record<string, any> | undefined);
            latestRef.current.setHoverId(id);
            map.getCanvas().style.cursor = id ? 'pointer' : '';
        });
        onMap('mouseleave', interactiveLayers, () => {
            latestRef.current.setHoverId(null);
            map.getCanvas().style.cursor = '';
        });

        onMap('click', async (event: any) => {
            const latest = latestRef.current;
            if (latest.drawingMode === 'none') return;
            const { lat, lng } = toLngLatEvent(event);
            let snapped = latest.snappedPointRef.current;
            if (!snapped) snapped = await latest.snapNow(lat, lng, 0.00002);
            latest.onLocationChange?.(snapped ? snapped.y : lat, snapped ? snapped.x : lng, snapped?.id || null);
        });
        onMap('dblclick', (event: any) => {
            const latest = latestRef.current;
            if (latest.drawingMode !== 'polyline') return;
            event.preventDefault();
            latest.onFinishDrawing?.();
        });
        onMap('contextmenu', (event: any) => {
            const latest = latestRef.current;
            if (latest.drawingMode !== 'none') {
                event.preventDefault();
                latest.onFinishDrawingSession?.();
            }
        });
        onMap('mousemove', (event: any) => {
            pendingSnapEventRef.current = event;
            if (snapRafRef.current) return;
            snapRafRef.current = requestAnimationFrame(() => {
                snapRafRef.current = 0;
                const latest = latestRef.current;
                const pendingEvent = pendingSnapEventRef.current;
                pendingSnapEventRef.current = null;
                if (!pendingEvent || (latest.drawingMode === 'none' && !latest.editingFeatureId)) return;
                const { lat, lng } = toLngLatEvent(pendingEvent);
                latest.performSnap(lat, lng);
            });
        });
        onMap('mouseout', () => {
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
        onMap('mousedown', EDIT_VERTEX_LAYER_ID, startEditDrag('update'));
        onMap('mousedown', EDIT_MIDPOINT_LAYER_ID, startEditDrag('insert'));
        onMap('mouseup', async (event: any) => {
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

        const onGlobalMouseUp = async (event: MouseEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            dragRef.current = null;
            map.dragPan.enable();
            map.getCanvas().style.cursor = '';

            const rect = map.getContainer().getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const lngLat = map.unproject([x, y]);

            const latest = latestRef.current;
            let snapped = latest.snappedPointRef.current;
            if (!snapped) snapped = await latest.snapNow(lngLat.lat, lngLat.lng, 0.00003);
            const finalLat = snapped ? snapped.y : lngLat.lat;
            const finalLng = snapped ? snapped.x : lngLat.lng;
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
        };
        window.addEventListener('mouseup', onGlobalMouseUp);

        try {
            setMap(map);
        } catch {
            // Optional MapProvider
        }

        return () => {
            mapListenerCleanups.forEach(cleanup => cleanup());
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            basemapRetryTimersRef.current.forEach(timer => clearTimeout(timer));
            basemapRetryTimersRef.current = [];
            window.removeEventListener('mouseup', onGlobalMouseUp);
            if (snapRafRef.current) {
                cancelAnimationFrame(snapRafRef.current);
                snapRafRef.current = 0;
            }
            if (iconReadyRafRef.current) {
                cancelAnimationFrame(iconReadyRafRef.current);
                iconReadyRafRef.current = 0;
            }
            featureStateRevisionRef.current += 1;
            pendingLoadedIconsRef.current.clear();
            pendingSnapEventRef.current = null;
            pendingIconPreloadMsRef.current = null;
            try {
                setMap(null);
            } catch {
                // Optional MapProvider
            }
            resizeObserver?.disconnect();
            clearMapImageCache();
            if (ownsMap) {
                map.remove();
            } else {
                cleanupDesignMapArtifacts(map);
            }
            mapRef.current = null;
        };
    }, [contextMap, shouldUsePersistentBasemap]);

    React.useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const shouldEnableGestures = (drawingMode === 'none' || drawingMode === 'move') && !editingFeatureId && !isMeasureActive && !dragRef.current;
        setMapGesturesEnabled(map, shouldEnableGestures);
    }, [drawingMode, editingFeatureId, isMeasureActive]);

    const prevCenterZoomRef = React.useRef<{ lat: number; lng: number; zoom: number }>({
        lat: center[0],
        lng: center[1],
        zoom,
    });

    React.useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const prev = prevCenterZoomRef.current;
        const centerChanged = Math.abs(prev.lat - center[0]) > 1e-6 || Math.abs(prev.lng - center[1]) > 1e-6;
        const zoomChanged = Math.abs(prev.zoom - zoom) > 1e-2;

        if (centerChanged || zoomChanged) {
            prevCenterZoomRef.current = { lat: center[0], lng: center[1], zoom };
            map.jumpTo({ center: toLngLat(center), zoom });
        }
    }, [center, zoom]);

    // Reset per-project milestone guards when the active project changes.
    const prevProjectIdRef = React.useRef<string | null | undefined>(null);
    React.useEffect(() => {
        if (prevProjectIdRef.current !== projectId) {
            prevProjectIdRef.current = projectId;
            firstSetDataReportedRef.current = false;
            firstPaintReportedRef.current = false;
            bindCompleteReportedRef.current = false;
            lastSetDataKeyRef.current = null;
            lastClusterSetDataKeyRef.current = null;
            // Reset telemetry so the new project gets fresh timing measurements.
            resetTelemetry();
        }
    }, [projectId]);

    React.useEffect(() => {
        const map = mapRef.current;
        const bounds = getValidBootstrapBounds(initialBounds);
        if (!map || !bounds) return;
        const boundsKey = `${projectId || 'no-project'}:${mapRevision}:${bounds.flat().join(',')}`;
        if (fittedBootstrapBoundsKeyRef.current === boundsKey) return;
        fittedBootstrapBoundsKeyRef.current = boundsKey;

        const fit = () => {
            if (typeof map.fitBounds !== 'function') return;
            map.fitBounds(bounds, { padding: 72, maxZoom: 18, duration: 0 });
            setViewportTick(tick => tick + 1);
        };
        if (map.isStyleLoaded()) fit();
        else map.once('load', fit);
    }, [initialBounds, mapRevision, projectId]);

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
                const viewportQueryMs = now() - queryStart;
                if (!firstViewportQueryReportedRef.current) {
                    firstViewportQueryReportedRef.current = true;
                    updateOpenMetrics({ firstViewportQueryMs: viewportQueryMs });
                    console.info('[OpenPerf] First viewport query complete', {
                        projectId,
                        firstViewportQueryMs: viewportQueryMs,
                        returned: response.returned ?? response.features?.length ?? 0,
                        total: response.total ?? 0,
                        truncated: Boolean(response.truncated),
                    });
                }
                setViewportFeatures(response.features || [], response.total || 0, Boolean(response.truncated));
                const previousMetrics = useDesignSync.getState().renderMetrics;
                if (previousMetrics) {
                    setRenderMetrics({
                        ...previousMetrics,
                        viewportQueryMs,
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
    }, [isLargeProject, mapHiddenIds, mapRevision, projectId, setRenderMetrics, setViewportFeatures, setViewportLoading, updateOpenMetrics, viewportFeatureLimit, viewportTick]);

    // Basemap tiles.
    //
    // When the persistent basemap owns the map, the tile URLs are the core
    // runtime's business: it routes them through the on-disk tile cache, so
    // writing raw upstream URLs onto the shared source here would silently
    // replace the cached URLs and defeat the cache. In that mode this effect only
    // maintains the design module's own overlay layers and leaves the raster
    // source alone. The raw-URL path remains for the standalone fallback map.
    React.useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        if (lastBasemapTilesKeyRef.current === basemapTilesKey) return;
        lastBasemapTilesKeyRef.current = basemapTilesKey;

        const updateTiles = () => {
            if (!shouldUsePersistentBasemap) {
                if (!updateRasterSourceTiles(map, BASEMAP_SOURCE_ID, basemapTiles)) {
                    console.warn('[MapLibreFastRenderer] Basemap source does not support tile updates.');
                }
            }
            basemapRetryTimersRef.current.forEach(timer => clearTimeout(timer));
            basemapRetryTimersRef.current = [];
            basemapRetryAttemptRef.current = 0;
            setBasemapLoadState(navigator.onLine === false ? 'offline' : 'ready');
            ensureBasemapOverlayLayers(map, activeBasemapPreset);
        };

        if (map.isStyleLoaded()) {
            updateTiles();
        } else {
            map.once('styledata', updateTiles);
        }
    }, [activeBasemapPreset, basemapTiles, basemapTilesKey, shouldUsePersistentBasemap]);

    React.useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.getSource(SOURCE_ID)) return;
        const nextSelected = selectedFeatureIdsForCollection(renderCollectionResult.collection, selectedFeatureId);
        scheduleSelectedFeatureState(nextSelected, false);
        overlayRef.current?.schedule(DirtyFlag.State);
    }, [renderCollectionResult, scheduleSelectedFeatureState, selectedFeatureId, viewportRevision]);

    React.useEffect(() => {
        applyHoverFeatureState(hoverId);
    }, [hoverId, applyHoverFeatureState]);

    React.useEffect(() => {
        if (selectedFeatureId) {
            const config = useLayoutStore.getState().paletteConfigs['spec-panel'];
            if (config && !config.isVisible) {
                useLayoutStore.setState((state) => {
                    const cfg = state.paletteConfigs['spec-panel'];
                    if (!cfg) return {};
                    let newColumns = [...state.layoutColumns];
                    const exists = newColumns.some((col) => col.includes('spec-panel'));
                    if (!exists) {
                        if (newColumns.length === 0) newColumns = [['spec-panel']];
                        else newColumns[0] = ['spec-panel', ...newColumns[0]];
                    }
                    return {
                        paletteConfigs: {
                            ...state.paletteConfigs,
                            'spec-panel': { ...cfg, isVisible: true, userClosed: false },
                        },
                        layoutColumns: newColumns,
                        activePaletteId: 'spec-panel',
                    };
                });
            }
        }
    }, [selectedFeatureId]);

    React.useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const render = () => {
            const frameStart = now();
            const { collection, lodPolicy, sourceBuildMs } = renderCollectionResult;
            const legacyCollection = renderFlags.overlayEnabled && renderFlags.overlayPoints
                ? withoutPointFeatures(collection)
                : collection;

            const applyData = () => {
                const layerSetupKey = [
                    lodPolicy.clusterPoints ? 'cluster' : 'plain',
                    lodPolicy.showLabels ? 'labels' : 'nolabels',
                    activeBasemapPreset?.id || activeBasemapPreset?.kind || 'default',
                    reportCaptureScope?.active ? 'report-capture' : 'normal',
                ].join(':');
                if (
                    layerSetupKeyRef.current !== layerSetupKey ||
                    !map.getSource(SOURCE_ID) ||
                    !map.getSource(POINT_CLUSTER_SOURCE_ID) ||
                    !map.getLayer(POINT_LAYER_ID) ||
                    !map.getSource(DRAWING_SOURCE_ID) ||
                    !map.getSource(EDIT_SOURCE_ID)
                ) {
                    ensureDesignLayers(map, lodPolicy.clusterPoints, lodPolicy.showLabels);
                    ensureBasemapOverlayLayers(map, reportCaptureScope?.active ? null : activeBasemapPreset);
                    ensureOverlayLayers(map);
                    layerSetupKeyRef.current = layerSetupKey;
                }
                const iconKey = String(iconReadyRevision);
                let displayCollection = preparedPointImagesRef.current?.collection === legacyCollection
                    && preparedPointImagesRef.current.missingIconKey === iconKey
                    ? preparedPointImagesRef.current.displayCollection
                    : null;
                if (!displayCollection) {
                    displayCollection = preparePointImages(map, legacyCollection, (imageId, image, iconPreloadMs) => {
                        pendingLoadedIconsRef.current.set(imageId, { image, preloadMs: iconPreloadMs });
                        if (iconReadyRafRef.current) return;
                        iconReadyRafRef.current = requestAnimationFrame(() => {
                            iconReadyRafRef.current = 0;
                            const currentMap = mapRef.current;
                            const batch = Array.from(pendingLoadedIconsRef.current.entries());
                            pendingLoadedIconsRef.current.clear();
                            if (!currentMap || batch.length === 0) return;

                            let didAdd = false;
                            let maxPreloadMs = 0;
                            for (const [id, item] of batch) {
                                try {
                                    if ((currentMap as any).style && !currentMap.hasImage(id)) {
                                        currentMap.addImage(id, item.image);
                                        didAdd = true;
                                        maxPreloadMs = Math.max(maxPreloadMs, item.preloadMs);
                                    }
                                } catch {
                                    // Map disposed before load completion
                                }
                            }
                            if (didAdd) {
                                currentMap.triggerRepaint();
                                if (maxPreloadMs > 0) updateOpenMetrics({ iconPreloadMs: maxPreloadMs });
                                setIconReadyRevision(revision => revision + 1);
                            }
                        });
                    });
                    preparedPointImagesRef.current = {
                        collection: legacyCollection,
                        missingIconKey: iconKey,
                        displayCollection,
                    };
                }
                const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
                const clusterSource = map.getSource(POINT_CLUSTER_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
                const legacyDataKey = renderFlags.overlayEnabled && renderFlags.overlayPoints
                    ? stableJsonKey(displayCollection)
                    : renderCacheKey;
                const clusterCollection = lodPolicy.clusterPoints ? onlyPointFeatures(displayCollection) : emptyCollection;
                const dataKey = `${legacyDataKey}::icons:${iconReadyRevision}`;
                const clusterDataKey = `${dataKey}::cluster:${lodPolicy.clusterPoints ? 'points' : 'empty'}`;
                const setDataStart = now();
                let didSetData = false;
                if (source && lastSetDataKeyRef.current !== dataKey) {
                    // --- Task 4.1: Progressive render — show first batch immediately ---
                    // Increment epoch to cancel any previous progressive render chain.
                    const currentEpoch = ++progressiveRenderEpochRef.current;
                    lastSetDataKeyRef.current = dataKey;
                    didSetData = true;

                    // Emit first-feature milestone + open metrics right after the first batch is handed to the source.
                    const onFirstBatch = () => {
                        const mapLibreSetDataMs = now() - setDataStart;
                        const firstBatchFeatureCount = Math.min(displayCollection.features.length, FIRST_BATCH_SIZE);
                        if (!firstSetDataReportedRef.current) {
                            firstSetDataReportedRef.current = true;
                            markMapStartup("first-feature", { count: firstBatchFeatureCount });
                            updateOpenMetrics({ firstSetDataMs: mapLibreSetDataMs });
                        }
                        if (!firstPaintReportedRef.current) {
                            firstPaintReportedRef.current = true;
                            const firstMapPaintMs = now() - frameStart;
                            updateOpenMetrics({ firstMapPaintMs });
                            console.info('[OpenPerf] First map paint complete', {
                                ...(useDesignSync.getState().openMetrics || {}),
                                firstSetDataMs: mapLibreSetDataMs,
                                firstMapPaintMs,
                                featureCount: firstBatchFeatureCount,
                            });
                        }
                    };

                    // Batch progress is exposed via React state (Task 4.5) and consumed
                    // by a loading indicator / data attributes on the container.
                    renderFeaturesBatched({
                        features: displayCollection.features,
                        setData: (collection) => {
                            // Guard: if a newer render epoch started, discard this stale batch write.
                            if (progressiveRenderEpochRef.current !== currentEpoch) return;
                            // Re-fetch the source each call so a mid-batch map teardown is tolerated.
                            const currentSource = mapRef.current?.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
                            currentSource?.setData(collection as any);
                        },
                        onFirstBatch,
                        onProgress: setBatchProgress,
                        onComplete: () => {
                            // Guard: only report project-bind-complete once, for the latest epoch.
                            if (progressiveRenderEpochRef.current !== currentEpoch) return;
                            if (!bindCompleteReportedRef.current) {
                                bindCompleteReportedRef.current = true;
                                markMapStartup('project-bind-complete');
                            }
                        },
                    });
                } else if (source) {
                    // Key unchanged — nothing to do for setData
                }
                if (clusterSource && lastClusterSetDataKeyRef.current !== clusterDataKey) {
                    clusterSource.setData(clusterCollection as any);
                    lastClusterSetDataKeyRef.current = clusterDataKey;
                }
                if (source && didSetData) {
                    const nextSelected = selectedFeatureIdsForCollection(displayCollection, selectedFeatureId);
                    scheduleSelectedFeatureState(nextSelected, true);
                    overlayRef.current?.schedule(DirtyFlag.Geometry | DirtyFlag.Style);
                }
                const mapLibreSetDataMs = now() - setDataStart;
                const newMetrics = buildRenderMetrics({
                    engine: 'maplibre-fast',
                    lodLevel: lodPolicy.level,
                    featureCount: displayCollection.features.length,
                    sourceBuildMs,
                    mapLibreSetDataMs,
                    frameMs: now() - frameStart,
                });
                const currentMetrics = useDesignSync.getState().renderMetrics;
                if (didSetData && (!currentMetrics || currentMetrics.featureCount !== newMetrics.featureCount || currentMetrics.lodLevel !== newMetrics.lodLevel)) {
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
    }, [activeBasemapPreset, iconReadyRevision, renderCacheKey, renderCollectionResult, renderFlags, reportCaptureScope, scheduleSelectedFeatureState, selectedFeatureId, setRenderMetrics, updateOpenMetrics]);

    React.useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const applyData = () => {
            ensureOverlayLayers(map);
            if (reportCaptureScope?.active) {
                setGeoJsonData(map, DRAWING_SOURCE_ID, emptyOverlayCollection);
                setGeoJsonData(map, EDIT_SOURCE_ID, emptyOverlayCollection);
                overlayRef.current?.schedule(DirtyFlag.State);
                return;
            }
            setGeoJsonData(map, DRAWING_SOURCE_ID, buildDrawingOverlay(currentDrawingPoints, snappedPoint));
            setGeoJsonData(map, EDIT_SOURCE_ID, buildEditOverlay(editCoords, polylineSnapMarkers));
            overlayRef.current?.schedule(DirtyFlag.Geometry);
        };

        if (map.isStyleLoaded()) {
            applyData();
        } else {
            map.once('styledata', applyData);
        }
    }, [currentDrawingPoints, editCoords, polylineSnapMarkers, reportCaptureScope, snappedPoint]);

    React.useEffect(() => {
        const map = mapRef.current;
        if (!map || !zoomToTrigger) return;
        const feature = getRenderableFeatureById(zoomToTrigger.id, { state: mapState, visibleFeatures: features, featureDetailsCache });
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
    }, [featureDetailsCache, features, mapState, zoomToTrigger]);

    return (
        <div
            ref={containerRef}
            className={`design-maplibre-fast ${shouldUsePersistentBasemap ? 'design-maplibre-fast--attached' : ''}`}
            data-testid="maplibre-fast-renderer"
            data-map-attach-mode={shouldUsePersistentBasemap ? 'persistent-basemap' : 'owned'}
            data-basemap-state={basemapLoadState}
            data-batch-rendered={batchProgress.rendered}
            data-batch-total={batchProgress.total}
        >
            <FeatureOverlayCanvas
                ref={overlayRef}
                camera={cameraBridgeRef.current.getSnapshot()}
                designFeatures={renderCollectionResult.collection}
                renderFlags={renderFlags}
                selectedIds={selectedFeatureIdsForCollection(renderCollectionResult.collection, selectedFeatureId)}
            />
        </div>
    );
}
