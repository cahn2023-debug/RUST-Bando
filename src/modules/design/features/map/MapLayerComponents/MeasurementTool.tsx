import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react';
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

/**
 * Leaflet canvas paint values — render data, NOT UI chrome, so these stay literal
 * hexes (MASTER.md §2: map data colours must be stable across themes; a themed
 * token here would repaint the measurement geometry when the theme flips).
 * Hoisted out of render so the option objects keep a stable identity.
 */
const MEASURE_LINE_STYLE = {
    color: '#38bdf8',
    weight: 3,
    opacity: 0.95,
} as const;

const MEASURE_VERTEX_STYLE = {
    color: '#e0f2fe',
    fillColor: '#0284c7',
    fillOpacity: 1,
    weight: 2,
} as const;

const MEASURE_HOVER_VERTEX_STYLE = {
    color: '#bae6fd',
    fillColor: '#38bdf8',
    fillOpacity: 0.55,
    weight: 1,
} as const;

const MEASURE_PANEL_TITLE_ID = 'measure-panel-title';

/** Keep panel clicks from reaching the Leaflet map behind it. */
const stopEvent = (event: SyntheticEvent) => event.stopPropagation();
const preventEvent = (event: SyntheticEvent) => event.preventDefault();

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
                        ...MEASURE_LINE_STYLE,
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
                    pathOptions={MEASURE_VERTEX_STYLE}
                />
            ))}

            {hoverPoint && (
                <CircleMarker
                    center={toTuple(hoverPoint)}
                    radius={4}
                    interactive={false}
                    pathOptions={MEASURE_HOVER_VERTEX_STYLE}
                >
                    <Tooltip permanent direction="top" offset={[0, -8]} opacity={1} className="measure-tooltip">
                        {formatDistance(totalDistance)}
                    </Tooltip>
                </CircleMarker>
            )}

            <div
                className="measure-panel pointer-events-auto"
                role="group"
                aria-labelledby={MEASURE_PANEL_TITLE_ID}
                onClick={stopEvent}
                onMouseDown={stopEvent}
                onContextMenu={preventEvent}
            >
                <div id={MEASURE_PANEL_TITLE_ID} className="text-[9px] font-black uppercase tracking-widest text-cad-text-muted">
                    Đo khoảng cách
                </div>
                <output className="mt-1 block font-mono text-sm font-black text-cad-text-primary" aria-live="polite">
                    {formatDistance(totalDistance)}
                </output>
                <div className="mt-1 text-[9px] text-cad-text-secondary">
                    Click để thêm điểm, chuột phải hoặc ESC để thoát
                </div>
                <button
                    type="button"
                    onClick={clearMeasure}
                    className="mt-2 w-full cursor-pointer border border-cad-border px-2 py-1 text-[9px] font-black uppercase text-cad-text-secondary hover:border-cad-accent hover:text-cad-accent"
                >
                    Kết thúc
                </button>
            </div>
        </>
    );
}
