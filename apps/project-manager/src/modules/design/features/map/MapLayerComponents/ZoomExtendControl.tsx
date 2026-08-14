import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMapContext } from '../MapContext';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { getCoordinates } from '../coordinateCache';

export const isValidLatLng = (lat: number, lng: number) => {
    return Math.abs(lat) > 0.0001 && Math.abs(lng) > 0.0001 &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180;
};

export function ZoomExtendControl() {
    let map: maplibregl.Map | null = null;
    try {
        map = useMapContext().map;
    } catch {
        // Optional
    }
    const state = useDesignSync(s => s.state);
    const projectId = useDesignSync(s => s.projectId);
    const visibleFeatures = useDesignSync(s => s.visibleFeatures);
    const isHydrating = useDesignSync(s => s.isHydrating);
    const isViewportLoading = useDesignSync(s => s.isViewportLoading);
    const zoomExtendTrigger = useDesignSync(s => s.zoomExtendTrigger);
    const lastTrigger = useRef(0);
    const lastZoomedProjectId = useRef<string | null>(null);
    const rafRef = useRef(0);

    useEffect(() => {
        if (!map || !state) return;
        if (!map.isStyleLoaded()) return;

        const isNewProjectLoad = projectId && projectId !== lastZoomedProjectId.current;
        const isManualTrigger = zoomExtendTrigger > 0 && zoomExtendTrigger !== lastTrigger.current;

        if (!isNewProjectLoad && !isManualTrigger) return;

        const { feature_groups, layers } = state;
        const features = state.isLargeProject ? visibleFeatures : state.features;
        if (!features || !feature_groups || !layers) return;
        const featureValues = Object.values(features);
        if (featureValues.length === 0 && (isHydrating || isViewportLoading || (state.featureCount ?? 0) > 0)) {
            return;
        }

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            if (!map) return;
            let count = 0;
            let minLat = Infinity;
            let maxLat = -Infinity;
            let minLng = Infinity;
            let maxLng = -Infinity;

            const processPoint = (lat: number, lng: number) => {
                if (isValidLatLng(lat, lng)) {
                    count++;
                    if (lat < minLat) minLat = lat;
                    if (lat > maxLat) maxLat = lat;
                    if (lng < minLng) minLng = lng;
                    if (lng > maxLng) maxLng = lng;
                }
            };

            for (let i = 0; i < featureValues.length; i++) {
                const f = featureValues[i];
                if (!f) continue;
                const group = f.group_id ? feature_groups[f.group_id] : null;
                if (group && !group.is_visible) continue;
                if (group && group.layer_id) {
                    const layer = layers[group.layer_id];
                    if (layer && !layer.is_visible) continue;
                }

                try {
                    const rawCoords = f.coordinates as any;
                    const coords = getCoordinates(f.id, rawCoords) as any;
                    if (!coords) continue;
                    const type = (f.geom_type || 'Point').toUpperCase();

                    if ((type === 'POINT' || type === 'INTERSECTION') && coords.length >= 2) {
                        processPoint(Number(coords[1]), Number(coords[0]));
                    } else if (type === 'LINESTRING' || type === 'POLYLINE') {
                        for (let j = 0; j < coords.length; j++) {
                            const c = coords[j];
                            if (c && c.length >= 2) processPoint(Number(c[1]), Number(c[0]));
                        }
                    } else if (type === 'POLYGON' && coords[0]) {
                        const ring = coords[0];
                        for (let j = 0; j < ring.length; j++) {
                            const c = ring[j];
                            if (c && c.length >= 2) processPoint(Number(c[1]), Number(c[0]));
                        }
                    }
                } catch {
                    // Ignore malformed coordinates silently for speed
                }
            }

            if (count > 0 && Number.isFinite(minLat) && Number.isFinite(minLng)) {
                console.log(`[ZoomExtend] Single-pass processed ${count} points.`);
                const bounds = new maplibregl.LngLatBounds([minLng, minLat], [maxLng, maxLat]);
                map.fitBounds(bounds, { padding: 60, maxZoom: 18, duration: 400 });
                lastZoomedProjectId.current = projectId;
                lastTrigger.current = zoomExtendTrigger;
            } else {
                console.info("[ZoomExtend] No valid points found to zoom to.");
                if (isManualTrigger) {
                    lastTrigger.current = zoomExtendTrigger;
                }
            }
        });
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
            }
        };
    }, [zoomExtendTrigger, projectId, state, visibleFeatures, isHydrating, isViewportLoading, map]);

    return null;
}
