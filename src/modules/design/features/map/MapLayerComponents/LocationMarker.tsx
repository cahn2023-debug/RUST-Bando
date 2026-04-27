import { useMapEvents } from 'react-leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useSnap } from '@IMPLEMENT/hooks/useSnap';

interface LocationMarkerProps {
    onLocationChange: (lat: number, lng: number, snapId?: string | null) => void;
    onFinishDrawing?: () => void;
}

export function LocationMarker({ onLocationChange, onFinishDrawing }: LocationMarkerProps) {
    const drawingMode = useDesignSync(s => s.drawingMode);
    const { performSnap, snapNow, clearSnap, snappedPointRef } = useSnap();

    useMapEvents({
        async click(e) {
            if (drawingMode === 'none') return;
            console.log("[MapClick] Handling click at", e.latlng.lat, e.latlng.lng);

            // Use snapped point from Ref, but if null, try a quick real-time check to overcome race conditions
            let snappedPoint = snappedPointRef.current;
            if (!snappedPoint) {
                // Remove buffer: only snap if strictly within visual threshold (2.2m)
                snappedPoint = await snapNow(e.latlng.lat, e.latlng.lng, 0.00002);
            }

            const finalLng = snappedPoint ? snappedPoint.x : e.latlng.lng;
            const finalLat = snappedPoint ? snappedPoint.y : e.latlng.lat;
            const snapId = snappedPoint?.id || null;

            onLocationChange(finalLat, finalLng, snapId);
        },
        dblclick() {
            if (drawingMode === 'polyline') {
                onFinishDrawing?.();
            }
        },
        mousemove(e) {
            performSnap(e.latlng.lat, e.latlng.lng);
        },
        mouseout() {
            clearSnap();
        }
    });

    return null;
}
