import { useState } from 'react';
import { useMapEvents } from 'react-leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useSnap } from '@IMPLEMENT/hooks/useSnap';

interface LocationMarkerProps {
    onLocationChange: (lat: number, lng: number, snapId?: string | null) => void;
    onFinishDrawing?: () => void;
    onFinishDrawingSession?: () => void;
}

type CoordinatePopupState = {
    lat: number;
    lng: number;
    x: number;
    y: number;
    copied: boolean;
} | null;

const formatCoordinate = (value: number) => value.toFixed(7);

export function LocationMarker({ onLocationChange, onFinishDrawing, onFinishDrawingSession }: LocationMarkerProps) {
    const drawingMode = useDesignSync(s => s.drawingMode);
    const editingFeatureId = useDesignSync(s => s.editingFeatureId);
    const [coordinatePopup, setCoordinatePopup] = useState<CoordinatePopupState>(null);
    const { performSnap, snapNow, clearSnap, snappedPointRef } = useSnap();

    const handleCopyCoordinates = async () => {
        if (!coordinatePopup) return;
        const text = `${formatCoordinate(coordinatePopup.lat)}, ${formatCoordinate(coordinatePopup.lng)}`;
        await navigator.clipboard?.writeText(text);
        setCoordinatePopup({ ...coordinatePopup, copied: true });
    };

    useMapEvents({
        async click(e) {
            setCoordinatePopup(null);
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
        contextmenu(e) {
            e.originalEvent?.preventDefault();
            if (drawingMode !== 'none') {
                onFinishDrawingSession?.();
                return;
            }
            if (editingFeatureId) return;
            setCoordinatePopup({
                lat: e.latlng.lat,
                lng: e.latlng.lng,
                x: e.containerPoint.x,
                y: e.containerPoint.y,
                copied: false,
            });
        },
        mousemove(e) {
            if (drawingMode === 'none' && !editingFeatureId) return;
            performSnap(e.latlng.lat, e.latlng.lng);
        },
        mouseout() {
            if (drawingMode === 'none' && !editingFeatureId) return;
            clearSnap();
        }
    });

    if (!coordinatePopup) return null;

    return (
        <div
            className="absolute z-[1000] min-w-48 -translate-x-1/2 rounded-sm border border-cad-border bg-cad-elevated text-cad-text-primary font-mono shadow-2xl shadow-black/40 pointer-events-auto overflow-hidden"
            style={{
                left: coordinatePopup.x,
                top: coordinatePopup.y,
                transform: 'translate(-50%, calc(-100% - 10px))',
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
        >
            <div className="border-b border-cad-border/70 px-3 py-2 text-[10px] font-black uppercase text-cad-text-secondary">
                Tọa độ điểm click
            </div>
            <div className="space-y-1 px-3 py-2 text-[11px]">
                <div className="flex justify-between gap-3">
                    <span className="text-cad-text-muted">Lat</span>
                    <span>{formatCoordinate(coordinatePopup.lat)}</span>
                </div>
                <div className="flex justify-between gap-3">
                    <span className="text-cad-text-muted">Lng</span>
                    <span>{formatCoordinate(coordinatePopup.lng)}</span>
                </div>
            </div>
            <button
                type="button"
                className="w-full border-t border-cad-border/70 px-3 py-2 text-left text-[10px] font-black uppercase text-cad-accent hover:bg-cad-accent hover:text-black transition-colors"
                onClick={handleCopyCoordinates}
            >
                {coordinatePopup.copied ? 'Đã copy tọa độ' : 'Copy tọa độ'}
            </button>
        </div>
    );
}
