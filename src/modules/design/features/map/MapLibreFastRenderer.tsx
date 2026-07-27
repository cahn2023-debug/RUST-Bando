import React from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { queryVisibleFeaturesV2 } from '@TOOL/utils/designIpc';
import { useMapStyles } from './useMapStyles';
import { buildMapLibreFeatureCollection } from './mapLibreFastAdapter';
import { buildRenderMetrics } from './mapRenderMetrics';
import type { MapLibreRenderFeatureCollection } from './mapLibreFastTypes';

const SOURCE_ID = 'design-fast-features';
const POINT_LAYER_ID = 'design-fast-points';
const POINT_CLUSTER_LAYER_ID = 'design-fast-point-clusters';
const LINE_LAYER_ID = 'design-fast-lines';
const POLYGON_LAYER_ID = 'design-fast-polygons';
const POLYGON_STROKE_LAYER_ID = 'design-fast-polygon-strokes';
const LABEL_LAYER_ID = 'design-fast-labels';
const MAP_MAX_ZOOM = 23;
const MAP_MAX_NATIVE_ZOOM = 20;

const emptyCollection: MapLibreRenderFeatureCollection = {
    type: 'FeatureCollection',
    features: [],
};

const canUsePerformanceNow = () => typeof performance !== 'undefined' && typeof performance.now === 'function';
const now = () => canUsePerformanceNow() ? performance.now() : Date.now();

const toLngLat = (center: [number, number]): [number, number] => [center[1], center[0]];

const createRasterStyle = (tileUrl: string): maplibregl.StyleSpecification => ({
    version: 8,
    sources: {
        basemap: {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            maxzoom: MAP_MAX_NATIVE_ZOOM,
        },
    },
    layers: [
        {
            id: 'basemap',
            type: 'raster',
            source: 'basemap',
        },
    ],
});

const ensureDesignLayers = (map: maplibregl.Map, clusterPoints: boolean, showLabels: boolean) => {
    if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
            type: 'geojson',
            data: emptyCollection as any,
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
                'fill-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.42, 0.18],
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
                'line-width': ['case', ['boolean', ['get', 'selected'], false], 4, 1.5],
                'line-opacity': 0.9,
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
                'line-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.98, 0.74],
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
                'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 9, ['get', 'size']],
                'circle-opacity': ['case', ['boolean', ['get', 'selected'], false], 1, 0.82],
                'circle-stroke-color': ['case', ['boolean', ['get', 'selected'], false], '#ecfeff', '#ffffff'],
                'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 3, 1],
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

export function MapLibreFastRenderer({
    center,
    zoom,
}: {
    center: [number, number];
    zoom: number;
}) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const mapRef = React.useRef<maplibregl.Map | null>(null);
    const requestRef = React.useRef(0);
    const features = useDesignSync(s => s.visibleFeatures);
    const rawFeatures = useDesignSync(s => s.state?.features || {});
    const isLargeProject = useDesignSync(s => Boolean(s.state?.isLargeProject));
    const projectId = useDesignSync(s => s.projectId);
    const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
    const mapHiddenIds = useDesignSync(s => s.mapHiddenIds);
    const viewportFeatureLimit = useDesignSync(s => s.state?.viewportFeatureLimit || 10000);
    const viewportRevision = useDesignSync(s => s.viewportRevision);
    const selectFeature = useDesignSync(s => s.selectFeature);
    const setHoverId = useDesignSync(s => s.setHoverId);
    const zoomToTrigger = useDesignSync(s => s.zoomToTrigger);
    const setViewportFeatures = useDesignSync(s => s.setViewportFeatures);
    const setViewportLoading = useDesignSync(s => s.setViewportLoading);
    const setRenderMetrics = useDesignSync(s => s.setRenderMetrics);
    const { getStyledUrl, mapKey } = useMapStyles();
    const [currentZoom, setCurrentZoom] = React.useState(zoom);
    const [viewportTick, setViewportTick] = React.useState(0);
    const renderFeatureValues = React.useMemo(
        () => Object.values(isLargeProject ? features : rawFeatures),
        [features, isLargeProject, rawFeatures]
    );

    React.useEffect(() => {
        if (!containerRef.current || mapRef.current) return;
        const map = new maplibregl.Map({
            container: containerRef.current,
            style: createRasterStyle(getStyledUrl('y')),
            center: toLngLat(center),
            zoom,
            maxZoom: MAP_MAX_ZOOM,
            attributionControl: false,
        });
        mapRef.current = map;

        map.on('zoomend', () => setCurrentZoom(map.getZoom()));
        map.on('moveend', () => {
            setCurrentZoom(map.getZoom());
            setViewportTick(tick => tick + 1);
        });
        map.once('load', () => setViewportTick(tick => tick + 1));

        const interactiveLayers = [POINT_LAYER_ID, LINE_LAYER_ID, POLYGON_LAYER_ID];
        map.on('click', interactiveLayers, event => {
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

        return () => {
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
            true
        )
            .then(response => {
                if (requestId !== requestRef.current) return;
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
    }, [isLargeProject, mapHiddenIds, projectId, setRenderMetrics, setViewportFeatures, setViewportLoading, viewportFeatureLimit, viewportTick]);

    React.useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        map.setStyle(createRasterStyle(getStyledUrl('y')));
    }, [getStyledUrl, mapKey]);

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
            });
            const sourceBuildMs = now() - sourceStart;

            const applyData = () => {
                ensureDesignLayers(map, lodPolicy.clusterPoints, lodPolicy.showLabels);
                const setDataStart = now();
                const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
                source?.setData(collection as any);
                const mapLibreSetDataMs = now() - setDataStart;
                requestAnimationFrame(() => {
                    setRenderMetrics(buildRenderMetrics({
                        engine: 'maplibre-fast',
                        lodLevel: lodPolicy.level,
                        featureCount: collection.features.length,
                        sourceBuildMs,
                        mapLibreSetDataMs,
                        frameMs: now() - frameStart,
                    }));
                });
            };

            if (map.isStyleLoaded()) {
                applyData();
            } else {
                map.once('styledata', applyData);
            }
        };

        render();
    }, [currentZoom, mapHiddenIds, renderFeatureValues, selectedFeatureId, setRenderMetrics, viewportRevision]);

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
