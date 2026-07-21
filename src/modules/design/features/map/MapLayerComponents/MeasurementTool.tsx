import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { LatLng, LatLngTuple } from 'leaflet';

interface MeasurementToolProps {
    active: boolean;
    onDeactivate: () => void;
}

const formatDistance = (meters: number) => {
    if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 1 : 2)} km`;
    return `${Math.round(meters)} m`;
};

const toTuple = (point: LatLng): LatLngTuple => [point.lat, point.lng];

export function MeasurementTool({ active, onDeactivate }: MeasurementToolProps) {
    const map = useMap();
    const [points, setPoints] = useState<LatLng[]>([]);
    const [hoverPoint, setHoverPoint] = useState<LatLng | null>(null);

    const clearMeasure = useCallback(() => {
        setPoints([]);
        setHoverPoint(null);
        onDeactivate();
    }, [onDeactivate]);

    useEffect(() => {
        if (!active) {
            const resetTimer = window.setTimeout(() => {
                setPoints([]);
                setHoverPoint(null);
            }, 0);
            return () => window.clearTimeout(resetTimer);
        }

        map.getContainer().classList.add('measure-tool-active');
        map.doubleClickZoom.disable();
        return () => {
            map.getContainer().classList.remove('measure-tool-active');
            map.doubleClickZoom.enable();
        };
    }, [active, map]);

    useEffect(() => {
        if (!active) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                clearMeasure();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [active, clearMeasure]);

    useMapEvents({
        click(event) {
            if (!active) return;
            event.originalEvent?.preventDefault();
            setPoints((current) => [...current, event.latlng]);
            setHoverPoint(null);
        },
        mousemove(event) {
            if (!active || points.length === 0) return;
            setHoverPoint(event.latlng);
        },
        dblclick(event) {
            if (!active) return;
            event.originalEvent?.preventDefault();
            setHoverPoint(null);
        },
        contextmenu(event) {
            if (!active) return;
            event.originalEvent?.preventDefault();
            clearMeasure();
        },
    });

    const fixedDistance = useMemo(() => {
        return points.reduce((sum, point, index) => {
            if (index === 0) return 0;
            return sum + map.distance(points[index - 1], point);
        }, 0);
    }, [map, points]);

    const previewDistance = useMemo(() => {
        if (!hoverPoint || points.length === 0) return 0;
        return map.distance(points[points.length - 1], hoverPoint);
    }, [hoverPoint, map, points]);

    const totalDistance = fixedDistance + previewDistance;
    const path = useMemo(() => {
        const measured = points.map(toTuple);
        if (hoverPoint) measured.push(toTuple(hoverPoint));
        return measured;
    }, [hoverPoint, points]);

    if (!active) return null;

    return (
        <>
            {path.length >= 2 && (
                <Polyline
                    positions={path}
                    interactive={false}
                    pathOptions={{
                        color: '#38bdf8',
                        weight: 3,
                        opacity: 0.95,
                        dashArray: hoverPoint ? '8 8' : undefined,
                    }}
                />
            )}

            {points.map((point, index) => (
                <CircleMarker
                    key={`${point.lat}-${point.lng}-${index}`}
                    center={toTuple(point)}
                    radius={5}
                    interactive={false}
                    pathOptions={{
                        color: '#e0f2fe',
                        fillColor: '#0284c7',
                        fillOpacity: 1,
                        weight: 2,
                    }}
                />
            ))}

            {hoverPoint && (
                <CircleMarker
                    center={toTuple(hoverPoint)}
                    radius={4}
                    interactive={false}
                    pathOptions={{
                        color: '#bae6fd',
                        fillColor: '#38bdf8',
                        fillOpacity: 0.55,
                        weight: 1,
                    }}
                >
                    <Tooltip permanent direction="top" offset={[0, -8]} opacity={1} className="measure-tooltip">
                        {formatDistance(totalDistance)}
                    </Tooltip>
                </CircleMarker>
            )}

            <div
                className="measure-panel pointer-events-auto"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
            >
                <div className="text-[9px] font-black uppercase tracking-widest text-cad-text-muted">Đo khoảng cách</div>
                <div className="mt-1 font-mono text-sm font-black text-cad-text-primary">
                    {formatDistance(totalDistance)}
                </div>
                <div className="mt-1 text-[9px] text-cad-text-secondary">
                    Click để thêm điểm, chuột phải hoặc ESC để thoát
                </div>
                <button
                    type="button"
                    onClick={clearMeasure}
                    className="mt-2 w-full border border-cad-border px-2 py-1 text-[9px] font-black uppercase text-cad-text-secondary hover:border-cad-accent hover:text-cad-accent"
                >
                    Kết thúc
                </button>
            </div>
        </>
    );
}
