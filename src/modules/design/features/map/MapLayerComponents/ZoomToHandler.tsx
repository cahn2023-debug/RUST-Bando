import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { isValidLatLng } from '@DESIGN/features/map/MapLayerComponents/ZoomExtendControl';

export function ZoomToHandler() {
    const map = useMap();
    const state = useDesignSync(s => s.state);
    const zoomToTrigger = useDesignSync(s => s.zoomToTrigger);
    const lastTrigger = useRef(0);

    useEffect(() => {
        if (!zoomToTrigger || !state || zoomToTrigger.timestamp === lastTrigger.current) return;
        lastTrigger.current = zoomToTrigger.timestamp;

        const { id, type } = zoomToTrigger;

        if (type === 'feature') {
            const f = state.features[id];
            if (f) {
                try {
                    const coords = typeof f.coordinates === 'string' ? JSON.parse(f.coordinates) : f.coordinates;
                    const geomType = f.geom_type || 'Point';

                    if (geomType === 'Point' && coords && coords.length >= 2) {
                        if (isValidLatLng(coords[1], coords[0])) {
                            console.log(`[Zoom] Zooming to feature ${id} at zoom level 20`);
                            map.setView([coords[1], coords[0]], 20, { animate: true });
                        }
                    } else if (geomType === 'LineString' && coords && coords.length > 0) {
                        const bounds: L.LatLngExpression[] = [];
                        coords.forEach((c: any) => {
                            if (isValidLatLng(c[1], c[0])) bounds.push([c[1], c[0]]);
                        });
                        if (bounds.length > 0) {
                            console.log(`[Zoom] Fitting bounds for feature ${id} at max zoom 20`);
                            map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 20, animate: true });
                        }
                    } else if (geomType === 'Polygon' && coords && coords[0] && coords[0].length > 0) {
                        const bounds: L.LatLngExpression[] = [];
                        coords[0].forEach((c: any) => {
                            if (isValidLatLng(c[1], c[0])) bounds.push([c[1], c[0]]);
                        });
                        if (bounds.length > 0) {
                            console.log(`[Zoom] Fitting bounds for polygon ${id} at max zoom 20`);
                            map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 20, animate: true });
                        }
                    }
                } catch (e) {
                    console.error("[Zoom] Error zooming to feature:", e);
                }
            }
        } else if (type === 'layer') {
            const allLatLngs: L.LatLngExpression[] = [];
            Object.values(state.features).forEach(f => {
                const group = f.group_id ? state.feature_groups[f.group_id] : null;
                if (group && group.layer_id === id) {
                    try {
                        const coords = typeof f.coordinates === 'string' ? JSON.parse(f.coordinates) : f.coordinates;
                        const geomType = f.geom_type || 'Point';
                        if (geomType === 'Point' && coords && isValidLatLng(coords[1], coords[0])) {
                            allLatLngs.push([coords[1], coords[0]]);
                        } else if (geomType === 'LineString' && coords) {
                            coords.forEach((c: any) => { if (isValidLatLng(c[1], c[0])) allLatLngs.push([c[1], c[0]]); });
                        } else if (geomType === 'Polygon' && coords && coords[0]) {
                            coords[0].forEach((c: any) => { if (isValidLatLng(c[1], c[0])) allLatLngs.push([c[1], c[0]]); });
                        }
                    } catch (e) {
                        console.warn('[ZoomToHandler] Failed to parse coordinates for feature:', f.id, e);
                    }
                }
            });

            if (allLatLngs.length > 0) {
                map.fitBounds(L.latLngBounds(allLatLngs), { padding: [50, 50], maxZoom: 18 });
            }
        } else if (type === 'region') {
            const allLatLngs: L.LatLngExpression[] = [];
            Object.values(state.features).forEach(f => {
                const group = f.group_id ? state.feature_groups[f.group_id] : null;
                if (group) {
                    const layer = state.layers[group.layer_id];
                    if (layer && layer.region_id === id) {
                        try {
                            const coords = typeof f.coordinates === 'string' ? JSON.parse(f.coordinates) : f.coordinates;
                            if (f.geom_type === 'Point' || !f.geom_type) {
                                if (coords && isValidLatLng(coords[1], coords[0])) allLatLngs.push([coords[1], coords[0]]);
                            } else if (f.geom_type === 'Polygon' && coords && coords[0]) {
                                coords[0].forEach((c: any) => { if (isValidLatLng(c[1], c[0])) allLatLngs.push([c[1], c[0]]); });
                            } else if (coords) {
                                coords.forEach((c: any) => { if (isValidLatLng(c[1], c[0])) allLatLngs.push([c[1], c[0]]); });
                            }
                        } catch (e) {
                            console.warn('[ZoomToHandler] Failed to parse coordinates for region:', id, e);
                        }
                    }
                }
            });
            if (allLatLngs.length > 0) {
                map.fitBounds(L.latLngBounds(allLatLngs), { padding: [50, 50], maxZoom: 18 });
            }
        } else if (type === 'group') {
            const featuresInGroup = Object.values(state.features).filter(f => f.group_id === id);
            if (featuresInGroup.length === 0) return;

            const allLatLngs: L.LatLngExpression[] = [];
            featuresInGroup.forEach(f => {
                try {
                    const coords = typeof f.coordinates === 'string' ? JSON.parse(f.coordinates) : f.coordinates;
                    if (f.geom_type === 'Point' || !f.geom_type) {
                        if (coords && isValidLatLng(coords[1], coords[0])) allLatLngs.push([coords[1], coords[0]]);
                    } else if (f.geom_type === 'Polygon' && coords && coords[0]) {
                        coords[0].forEach((c: any) => { if (isValidLatLng(c[1], c[0])) allLatLngs.push([c[1], c[0]]); });
                    } else if (coords) {
                        coords.forEach((c: any) => { if (isValidLatLng(c[1], c[0])) allLatLngs.push([c[1], c[0]]); });
                    }
                } catch (e) {
                    console.warn('[ZoomToHandler] Failed to parse coordinates for layer:', layerId, e);
                }
            });

            if (allLatLngs.length > 0) {
                map.fitBounds(L.latLngBounds(allLatLngs), { padding: [50, 50], maxZoom: 18 });
            }
        } else if (type === 'location' && zoomToTrigger.location) {
            const [lat, lng] = zoomToTrigger.location;
            if (isValidLatLng(lat, lng)) {
                map.setView([lat, lng], 18);
            }
        }
    }, [zoomToTrigger, state, map]);

    return null;
}
