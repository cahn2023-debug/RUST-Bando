import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMapContext } from '../MapContext';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { isValidLatLng } from '@DESIGN/features/map/MapLayerComponents/ZoomExtendControl';
import { getLineCoordinates, getPointCoordinates, getPolygonCoordinates } from '@TOOL/utils/featureUtils';

export function ZoomToHandler() {
    let map: maplibregl.Map | null = null;
    try {
        map = useMapContext().map;
    } catch {
        // Optional
    }
    const state = useDesignSync(s => s.state);
    const featureDetailsCache = useDesignSync(s => s.featureDetailsCache);
    const visibleFeatures = useDesignSync(s => s.visibleFeatures);
    const zoomToTrigger = useDesignSync(s => s.zoomToTrigger);
    const lastTrigger = useRef(0);

    useEffect(() => {
        if (!map || !zoomToTrigger || !state || zoomToTrigger.timestamp === lastTrigger.current) return;
        lastTrigger.current = zoomToTrigger.timestamp;

        const { id, type } = zoomToTrigger;

        if (type === 'feature') {
            const f = state.features[id] || featureDetailsCache[id] || visibleFeatures[id];
            if (f) {
                try {
                    const point = getPointCoordinates(f);
                    const line = getLineCoordinates(f);
                    const polygon = getPolygonCoordinates(f)?.[0];

                    if (point && isValidLatLng(point[1], point[0])) {
                        console.log(`[Zoom] Zooming to feature ${id} at zoom level 20`);
                        map.flyTo({ center: [point[0], point[1]], zoom: 20 });
                    } else if (line && line.length > 0) {
                        const bounds = new maplibregl.LngLatBounds();
                        line.forEach((c) => {
                            if (isValidLatLng(c[1], c[0])) bounds.extend([c[0], c[1]]);
                        });
                        if (!bounds.isEmpty()) {
                            console.log(`[Zoom] Fitting bounds for feature ${id} at max zoom 20`);
                            map.fitBounds(bounds, { padding: 50, maxZoom: 20 });
                        }
                    } else if (polygon && polygon.length > 0) {
                        const bounds = new maplibregl.LngLatBounds();
                        polygon.forEach((c) => {
                            if (isValidLatLng(c[1], c[0])) bounds.extend([c[0], c[1]]);
                        });
                        if (!bounds.isEmpty()) {
                            console.log(`[Zoom] Fitting bounds for polygon ${id} at max zoom 20`);
                            map.fitBounds(bounds, { padding: 50, maxZoom: 20 });
                        }
                    }
                } catch (e) {
                    console.error("[Zoom] Error zooming to feature:", e);
                }
            }
        } else if (type === 'layer') {
            const bounds = new maplibregl.LngLatBounds();
            Object.values(state.features).forEach(f => {
                const group = f.group_id ? state.feature_groups[f.group_id] : null;
                if (group && group.layer_id === id) {
                    try {
                        const point = getPointCoordinates(f);
                        const line = getLineCoordinates(f);
                        const polygon = getPolygonCoordinates(f)?.[0];
                        if (point && isValidLatLng(point[1], point[0])) bounds.extend([point[0], point[1]]);
                        line?.forEach((c) => { if (isValidLatLng(c[1], c[0])) bounds.extend([c[0], c[1]]); });
                        polygon?.forEach((c) => { if (isValidLatLng(c[1], c[0])) bounds.extend([c[0], c[1]]); });
                    } catch (e) {
                        console.warn('[ZoomToHandler] Failed to parse coordinates for feature:', f.id, e);
                    }
                }
            });

            if (!bounds.isEmpty()) {
                map.fitBounds(bounds, { padding: 50, maxZoom: 18 });
            }
        } else if (type === 'region') {
            const bounds = new maplibregl.LngLatBounds();
            Object.values(state.features).forEach(f => {
                const group = f.group_id ? state.feature_groups[f.group_id] : null;
                if (group) {
                    const layer = state.layers[group.layer_id];
                    if (layer && layer.region_id === id) {
                        try {
                            const point = getPointCoordinates(f);
                            const line = getLineCoordinates(f);
                            const polygon = getPolygonCoordinates(f)?.[0];
                            if (point && isValidLatLng(point[1], point[0])) bounds.extend([point[0], point[1]]);
                            polygon?.forEach((c) => { if (isValidLatLng(c[1], c[0])) bounds.extend([c[0], c[1]]); });
                            line?.forEach((c) => { if (isValidLatLng(c[1], c[0])) bounds.extend([c[0], c[1]]); });
                        } catch (e) {
                            console.warn('[ZoomToHandler] Failed to parse coordinates for region:', id, e);
                        }
                    }
                }
            });
            if (!bounds.isEmpty()) {
                map.fitBounds(bounds, { padding: 50, maxZoom: 18 });
            }
        } else if (type === 'group') {
            const featuresInGroup = Object.values(state.features).filter(f => f.group_id === id);
            if (featuresInGroup.length === 0) return;

            const bounds = new maplibregl.LngLatBounds();
            featuresInGroup.forEach(f => {
                try {
                    const point = getPointCoordinates(f);
                    const line = getLineCoordinates(f);
                    const polygon = getPolygonCoordinates(f)?.[0];
                    if (point && isValidLatLng(point[1], point[0])) bounds.extend([point[0], point[1]]);
                    polygon?.forEach((c) => { if (isValidLatLng(c[1], c[0])) bounds.extend([c[0], c[1]]); });
                    line?.forEach((c) => { if (isValidLatLng(c[1], c[0])) bounds.extend([c[0], c[1]]); });
                } catch (e) {
                    console.warn('[ZoomToHandler] Failed to parse coordinates for group:', id, e);
                }
            });

            if (!bounds.isEmpty()) {
                map.fitBounds(bounds, { padding: 50, maxZoom: 18 });
            }
        } else if (type === 'location' && zoomToTrigger.location) {
            const [lat, lng] = zoomToTrigger.location;
            if (isValidLatLng(lat, lng)) {
                map.flyTo({ center: [lng, lat], zoom: 18 });
            }
        }
    }, [zoomToTrigger, state, map, featureDetailsCache, visibleFeatures]);

    return null;
}
