import React from 'react';
import { Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';

// Static paint/geometry config: identical for every vertex and never changes,
// so it is allocated once instead of per point per render.
const DRAWING_LINE_OPTIONS = {
    color: '#06b6d4',
    weight: 3,
    dashArray: '5, 10',
    opacity: 0.8
} as const;

// A single L.DivIcon instance is safe to share across markers: Leaflet builds a
// fresh DOM node per marker from this config in createIcon().
const DRAWING_POINT_ICON = new L.DivIcon({
    className: 'drawing-point-marker pointer-events-none',
    html: `<div style="width: 8px; height: 8px; background: white; border: 2px solid #06b6d4; border-radius: 50%; pointer-events: none;"></div>`,
    iconSize: [8, 8],
    iconAnchor: [4, 4]
});

const SNAP_INDICATOR_ICON = new L.DivIcon({
    className: 'snap-indicator-marker pointer-events-none',
    html: `<div style="width: 12px; height: 12px; background: rgba(251, 146, 60, 0.4); border: 2px solid #fb923c; border-radius: 50%; box-shadow: 0 0 10px #fb923c; pointer-events: none;"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

export const DrawingLayer = React.memo(() => {
    const drawingMode = useDesignSync(s => s.drawingMode);
    const editingFeatureId = useDesignSync(s => s.editingFeatureId);
    const currentDrawingPoints = useDesignSync(s => s.currentDrawingPoints);
    const snappedPoint = useDesignSync(s => s.snappedPoint);

    // Hook must run before the early return below to keep hook order stable.
    const latLngs = React.useMemo(
        () => currentDrawingPoints.map(p => [p[1], p[0]] as [number, number]),
        [currentDrawingPoints]
    );

    if (drawingMode === 'none' && !editingFeatureId) return null;

    return (
        <>
            <Polyline
                positions={latLngs}
                pathOptions={DRAWING_LINE_OPTIONS}
            />
            {latLngs.map((pos, idx) => (
                <Marker
                    key={idx}
                    position={pos}
                    interactive={false}
                    icon={DRAWING_POINT_ICON}
                />
            ))}
            {snappedPoint && (
                <Marker
                    position={[snappedPoint.y, snappedPoint.x]}
                    interactive={false}
                    zIndexOffset={1000}
                    icon={SNAP_INDICATOR_ICON}
                />
            )}
        </>
    );
});
