import type maplibregl from 'maplibre-gl';
import { MAP_POINT_CLUSTER_MAX_ZOOM } from '../mapDisplayPolicy';
import type { MapLibreFastFeatureCollection, MapLibreRenderFeatureCollection } from '../mapLibreFastTypes';
import { DirtyFlag, type CameraBridge } from '../render';

export const SOURCE_ID = 'design-fast-features';
export const POINT_CLUSTER_SOURCE_ID = 'design-fast-point-clusters-source';
const CAMERA_BRIDGE_LAYER_ID = 'design-camera-bridge';
const POINT_GLOW_LAYER_ID = 'design-fast-points-glow';
export const POINT_LAYER_ID = 'design-fast-points';
export const POINT_ICON_LAYER_ID = 'design-fast-point-icons';
export const POINT_LABEL_LAYER_ID = 'design-fast-point-labels';
export const POINT_CLUSTER_LAYER_ID = 'design-fast-point-clusters';
const POINT_CLUSTER_COUNT_LAYER_ID = 'design-fast-point-cluster-counts';
export const LINE_HIT_LAYER_ID = 'design-fast-line-hit-area';
const LINE_GLOW_LAYER_ID = 'design-fast-lines-glow';
export const LINE_LAYER_ID = 'design-fast-lines';
export const POLYGON_LAYER_ID = 'design-fast-polygons';
const POLYGON_STROKE_LAYER_ID = 'design-fast-polygon-strokes';
const LABEL_LAYER_ID = 'design-fast-labels';
export const DRAWING_SOURCE_ID = 'design-fast-drawing';
const DRAWING_LINE_LAYER_ID = 'design-fast-drawing-line';
const DRAWING_VERTEX_LAYER_ID = 'design-fast-drawing-vertices';
const SNAP_LAYER_ID = 'design-fast-snap-indicator';
export const EDIT_SOURCE_ID = 'design-fast-edit-handles';
export const EDIT_VERTEX_LAYER_ID = 'design-fast-edit-vertices';
export const EDIT_MIDPOINT_LAYER_ID = 'design-fast-edit-midpoints';
const EDIT_SNAP_LINK_LAYER_ID = 'design-fast-edit-snap-links';
export const DESIGN_RENDER_LAYER_IDS = [
    POINT_CLUSTER_COUNT_LAYER_ID,
    POINT_ICON_LAYER_ID,
    POINT_LABEL_LAYER_ID,
    LABEL_LAYER_ID,
    POINT_CLUSTER_LAYER_ID,
    POINT_GLOW_LAYER_ID,
    POINT_LAYER_ID,
] as const;
export const MAP_MAX_ZOOM = 23;
const POINT_GEOMETRY_FILTER = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false] as unknown as maplibregl.FilterSpecification;
const LINE_GEOMETRY_FILTER = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false] as unknown as maplibregl.FilterSpecification;
const POLYGON_GEOMETRY_FILTER = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false] as unknown as maplibregl.FilterSpecification;

const emptyCollection: MapLibreRenderFeatureCollection = {
    type: 'FeatureCollection',
    features: [],
};

export const emptyOverlayCollection: MapLibreFastFeatureCollection = {
    type: 'FeatureCollection',
    features: [],
};

export const createMapStyle = (): maplibregl.StyleSpecification => ({
    version: 8,
    sources: {},
    layers: [
        {
            id: 'neutral-background',
            type: 'background',
            paint: {
                'background-color': '#e5e7eb',
            },
        },
    ],
});

export const setGeoJsonData = (
    map: maplibregl.Map,
    sourceId: string,
    data: MapLibreFastFeatureCollection | MapLibreRenderFeatureCollection
) => {
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    source?.setData(data as any);
};

export const moveLayerToTop = (map: maplibregl.Map, layerId: string) => {
    if (!map.getLayer(layerId) || typeof (map as any).moveLayer !== 'function') return;
    (map as any).moveLayer(layerId);
};

const addMapLayer = (map: maplibregl.Map, layer: maplibregl.AddLayerObject, beforeId?: string) => {
    map.addLayer(layer, beforeId);
};

export const areDesignRenderLayersHydrated = (map: maplibregl.Map) => {
    try {
        return DESIGN_RENDER_LAYER_IDS.every(layerId => {
            const layer = map.getLayer(layerId) as { layout?: unknown } | undefined;
            return Boolean(layer?.layout);
        });
    } catch {
        return false;
    }
};

export const ensureCameraBridgeLayer = (
    map: maplibregl.Map,
    cameraBridge: CameraBridge,
    scheduleOverlay: (dirty: DirtyFlag) => void
) => {
    if (!map.isStyleLoaded()) return;
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

export const ensureDesignLayers = (map: maplibregl.Map, clusterPoints: boolean, showLabels: boolean) => {
    if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
            type: 'geojson',
            data: emptyCollection as any,
            promoteId: 'id',
        });
    }

    const existingClusterSource = map.getSource(POINT_CLUSTER_SOURCE_ID) as any;
    const shouldBeClustered = clusterPoints;
    if (existingClusterSource && Boolean(existingClusterSource.cluster) !== shouldBeClustered) {
        [
            POINT_CLUSTER_LAYER_ID,
            POINT_CLUSTER_COUNT_LAYER_ID,
            POINT_GLOW_LAYER_ID,
            POINT_LAYER_ID,
            POINT_ICON_LAYER_ID,
            POINT_LABEL_LAYER_ID,
        ].forEach(layerId => {
            try {
                if (map.getLayer(layerId)) map.removeLayer(layerId);
            } catch {
                // Ignore teardown races
            }
        });
        try {
            map.removeSource(POINT_CLUSTER_SOURCE_ID);
        } catch {
            // Ignore teardown races
        }
    }

    if (!map.getSource(POINT_CLUSTER_SOURCE_ID)) {
        map.addSource(POINT_CLUSTER_SOURCE_ID, {
            type: 'geojson',
            data: emptyCollection as any,
            promoteId: 'id',
            cluster: clusterPoints,
            clusterRadius: 48,
            maxzoom: MAP_POINT_CLUSTER_MAX_ZOOM + 1,
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
            source: POINT_CLUSTER_SOURCE_ID,
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
            source: POINT_CLUSTER_SOURCE_ID,
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
            source: POINT_CLUSTER_SOURCE_ID,
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
            source: POINT_CLUSTER_SOURCE_ID,
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

export const ensureOverlayLayers = (map: maplibregl.Map) => {
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

export const cleanupDesignMapArtifacts = (map: maplibregl.Map) => {
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
