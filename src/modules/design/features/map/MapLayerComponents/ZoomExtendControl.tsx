import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';

export const isValidLatLng = (lat: number, lng: number) => {
    // Only check basic mathematical validity and non-zero (near origin)
    return Math.abs(lat) > 0.0001 && Math.abs(lng) > 0.0001 &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180;
};

export function ZoomExtendControl() {
    const map = useMap();
    const state = useDesignSync(s => s.state);
    const zoomExtendTrigger = useDesignSync(s => s.zoomExtendTrigger);
    const lastTrigger = useRef(0);

    useEffect(() => {
        if (!state || zoomExtendTrigger === 0 || zoomExtendTrigger === lastTrigger.current) return;
        lastTrigger.current = zoomExtendTrigger;

        const { features, feature_groups, layers } = state;
        if (!features || !feature_groups || !layers) return;

        const allLatLngs: L.LatLngExpression[] = [];

        Object.values(features).forEach(f => {
            if (!f) return;
            const group = f.group_id ? feature_groups[f.group_id] : null;
            if (!group || !group.is_visible) return;
            const layer = layers[group.layer_id];
            if (!layer || !layer.is_visible) return;

            try {
                const coords = typeof f.coordinates === 'string' ? JSON.parse(f.coordinates) : f.coordinates;
                const type = f.geom_type || 'Point';

                if ((type === 'Point' || type === 'POINT' || type === 'INTERSECTION') && coords && coords.length >= 2) {
                    if (isValidLatLng(coords[1], coords[0])) {
                        allLatLngs.push([coords[1], coords[0]]);
                    }
                } else if ((type === 'LineString' || type === 'POLYLINE') && coords) {
                    coords.forEach((c: any) => {
                        if (isValidLatLng(c[1], c[0])) allLatLngs.push([c[1], c[0]]);
                    });
                } else if (type === 'Polygon' && coords && coords[0]) {
                    coords[0].forEach((c: any) => {
                        if (isValidLatLng(c[1], c[0])) allLatLngs.push([c[1], c[0]]);
                    });
                }
            } catch (e) {
                console.warn('[ZoomExtendControl] Failed to parse coordinates:', e);
            }
        });

        if (allLatLngs.length > 0) {
            let filteredPoints = allLatLngs;
            if (allLatLngs.length >= 3) {
                const lats = allLatLngs.map(p => (Array.isArray(p) ? (p as number[])[0] : (p as any).lat) as number);
                const lngs = allLatLngs.map(p => (Array.isArray(p) ? (p as number[])[1] : (p as any).lng) as number);

                const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
                const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

                filteredPoints = allLatLngs.filter(p => {
                    const plat = (Array.isArray(p) ? (p as number[])[0] : (p as any).lat) as number;
                    const plng = (Array.isArray(p) ? (p as number[])[1] : (p as any).lng) as number;
                    return Math.abs(plat - avgLat) < 3 && Math.abs(plng - avgLng) < 3;
                });
            }

            if (filteredPoints.length > 0) {
                const bounds = L.latLngBounds(filteredPoints as L.LatLngExpression[]);
                console.log("[ZoomExtend] Points collected:", allLatLngs.length, "Filtered:", filteredPoints.length);
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
            }
        } else {
            console.warn("[ZoomExtend] No valid points found to zoom to.");
        }
    }, [zoomExtendTrigger, state, map]);

    return null;
}
