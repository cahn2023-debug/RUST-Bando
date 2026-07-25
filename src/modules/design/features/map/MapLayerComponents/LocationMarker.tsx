import { useState, useRef, useEffect } from 'react';
import L from 'leaflet';
import { invoke } from '@tauri-apps/api/core';
import { useMapEvents } from 'react-leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useSnap } from '@IMPLEMENT/hooks/useSnap';

interface LocationMarkerProps {
    onLocationChange: (lat: number, lng: number, snapId?: string | null) => void;
    onFinishDrawing?: () => void;
    onFinishDrawingSession?: () => void;
    isMeasureActive?: boolean;
}

type CoordinatePopupState = {
    lat: number;
    lng: number;
    x: number;
    y: number;
    copied: boolean;
} | null;

const formatCoordinate = (value: number) => value.toFixed(7);
const CLIPBOARD_RETRY_ATTEMPTS = 4;
const CLIPBOARD_RETRY_DELAY_MS = 120;

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const copyTextToClipboard = async (text: string): Promise<boolean> => {
    try {
        await invoke('copy_text_to_system_clipboard', { text });
        return true;
    } catch {
        console.error('[Clipboard] copy_text_to_system_clipboard failed');
        // Fall back to the browser clipboard path below.
    }

    const hasClipboardApi = typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function';

    if (hasClipboardApi) {
        for (let attempt = 0; attempt < CLIPBOARD_RETRY_ATTEMPTS; attempt += 1) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                // Retry briefly when the OS clipboard is temporarily busy with another payload.
            }

            if (attempt < CLIPBOARD_RETRY_ATTEMPTS - 1) {
                await wait(CLIPBOARD_RETRY_DELAY_MS);
            }
        }
    }

    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
        return false;
    }

    for (let attempt = 0; attempt < CLIPBOARD_RETRY_ATTEMPTS; attempt += 1) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        try {
            if (document.execCommand('copy')) {
                return true;
            }
        } finally {
            document.body.removeChild(textarea);
        }

        if (attempt < CLIPBOARD_RETRY_ATTEMPTS - 1) {
            await wait(CLIPBOARD_RETRY_DELAY_MS);
        }
    }

    return false;
};

export function LocationMarker({
    onLocationChange,
    onFinishDrawing,
    onFinishDrawingSession,
    isMeasureActive = false
}: LocationMarkerProps) {
    const drawingMode = useDesignSync(s => s.drawingMode);
    const editingFeatureId = useDesignSync(s => s.editingFeatureId);
    const [coordinatePopup, setCoordinatePopup] = useState<CoordinatePopupState>(null);
    const { performSnap, snapNow, clearSnap, snappedPointRef } = useSnap();
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = popupRef.current;
        if (el) {
            L.DomEvent.disableClickPropagation(el);
            L.DomEvent.disableScrollPropagation(el);
        }
    }, [coordinatePopup]);

    const handleCopyCoordinates = async () => {
        if (!coordinatePopup) return;
        const text = `${formatCoordinate(coordinatePopup.lat)}, ${formatCoordinate(coordinatePopup.lng)}`;
        const copied = await copyTextToClipboard(text);
        if (!copied) return;
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
            if (editingFeatureId || isMeasureActive) return;
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
            ref={popupRef}
            className="absolute z-cad-map-control min-w-48 -translate-x-1/2 rounded-sm border border-cad-border bg-cad-elevated text-cad-text-primary font-mono shadow-2xl shadow-black/40 pointer-events-auto overflow-hidden"
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
