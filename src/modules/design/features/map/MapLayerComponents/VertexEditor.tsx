import React, { useMemo, useState, useCallback, useRef } from 'react';
import { Marker, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useSnap } from '@IMPLEMENT/hooks/useSnap';
import { getParsedCoordinates, getParsedMetadata, getPointCoordinates } from '@TOOL/utils/featureUtils';
import { isPointInPolygon, getIntersectionScope, isSignalLineFeature } from '../stores/drawingSlice';

/**
 * Enhanced Logging Helper
 */
const logEditor = (msg: string, details?: any) => {
    const time = new Date().toISOString().split('T')[1].split('Z')[0];
    console.log(`[${time}] [VertexEditor] ${msg}`, details || '');
};

/**
 * Robust Vertex Handle
 */
const VertexMarker = React.memo(({
    position,
    index,
    onDragStart,
    onContextMenu
}: {
    position: L.LatLngExpression,
    index: number,
    onDragStart: (e: any, i: number) => void,
    onContextMenu: (e: any, i: number) => void
}) => {
    return (
        <Marker
            position={position}
            interactive={true}
            draggable={false} // Custom drag implementation
            icon={new L.DivIcon({
                className: 'vertex-handle-modern',
                html: `<div style="width: 14px; height: 14px; background-color: #3B82F6; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 6px rgba(0,0,0,0.6); pointer-events: auto !important; touch-action: none !important;"></div>`,
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            })}
            zIndexOffset={1000}
            eventHandlers={({
                mousedown: (e: any) => {
                    L.DomEvent.stopPropagation(e.originalEvent || e);
                    onDragStart(e, index);
                },
                touchstart: (e: any) => {
                    L.DomEvent.stopPropagation(e.originalEvent || e);
                    onDragStart(e, index);
                },
                contextmenu: (e: any) => {
                    onContextMenu(e, index);
                }
            } as any)}
        />
    );
});

export const VertexEditor = () => {
    const editingFeatureId = useDesignSync(s => s.editingFeatureId);
    const state = useDesignSync(s => s.state);
    const setDrawingPoint = useDesignSync(s => s.setDrawingPoint);
    const insertDrawingPoint = useDesignSync(s => s.insertDrawingPoint);
    const activeParentFeatureId = useDesignSync(s => s.activeParentFeatureId);
    const { performSnap, snapNow, clearSnap, snappedPointRef } = useSnap();
    const map = useMap();

    // Local volatile state for UI feedback
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [dragType, setDragType] = useState<'update' | 'insert'>('update');
    const [previewCoords, setPreviewCoords] = useState<[number, number][] | null>(null);

    // Refs for stable coordinate access
    const coordsRef = useRef<[number, number][]>([]);

    const feature = useMemo(() => {
        if (!editingFeatureId || !state?.features[editingFeatureId]) return null;
        return state.features[editingFeatureId];
    }, [editingFeatureId, state]);

    const coords: [number, number][] = useMemo(() => {
        if (!feature) {
            coordsRef.current = [];
            return [];
        }
        const parsed = getParsedCoordinates(feature);
        if (!parsed || !Array.isArray(parsed)) return [];
        const isPolygon = feature?.geom_type?.toLowerCase() === 'polygon';
        const final = isPolygon ? (Array.isArray(parsed[0]) ? parsed[0] : parsed) : parsed;
        coordsRef.current = final as [number, number][];
        return coordsRef.current;
    }, [feature]);

    const handleDragStart = useCallback((_: any, i: number) => {
        logEditor(`Drag Start on vertex ${i}`);
        setDragType('update');
        setDraggingIndex(i);
        setPreviewCoords([...coordsRef.current]);
        map.dragging.disable(); // Prevent map pan
    }, [map]);

    useMapEvents({
        mousemove: (e) => {
            if (draggingIndex === null) return;
            const pos = e.latlng;
            performSnap(pos.lat, pos.lng);

            setPreviewCoords(prev => {
                if (!prev) return null;
                const updated = [...prev];
                const snapped = snappedPointRef.current;
                // Use snapped coordinates if available, otherwise mouse position
                updated[draggingIndex] = snapped ? [snapped.x, snapped.y] : [pos.lng, pos.lat];
                return updated;
            });
        },
        mouseup: async (e) => {
            if (draggingIndex === null) return;
            const i = draggingIndex;
            const pos = e.latlng;

            map.dragging.enable(); // Restore map pan
            setDraggingIndex(null);

            logEditor(`Drag End on vertex ${i} at ${pos.lat}, ${pos.lng}`);

            let snapped = snappedPointRef.current;
            if (!snapped) snapped = await snapNow(pos.lat, pos.lng, 0.00003);

            const finalLat = snapped ? snapped.y : pos.lat;
            const finalLng = snapped ? snapped.x : pos.lng;
            const snapId = snapped?.id || null;

            // ponytail: restrict SignalLine commit to intersection scope
            if (feature && isSignalLineFeature(feature)) {
                const parentId = activeParentFeatureId || (getParsedMetadata(feature).parent_feature_id as string | undefined);
                if (parentId) {
                    const scope = getIntersectionScope(parentId, state?.features || {});
                    if (scope) {
                        let checkLng = finalLng;
                        let checkLat = finalLat;
                        if (snapId && state?.features[snapId]) {
                            const targetFeature = state.features[snapId];
                            const targetCoords = getPointCoordinates(targetFeature);
                            if (targetCoords) {
                                checkLng = targetCoords[0];
                                checkLat = targetCoords[1];
                            }
                        }
                        if (!isPointInPolygon([checkLng, checkLat], scope)) {
                            logEditor(`Sync blocked: outside intersection scope`);
                            setPreviewCoords(null);
                            clearSnap();
                            return;
                        }
                    }
                }
            }

            try {
                if (dragType === 'insert') {
                    await insertDrawingPoint(i, finalLat, finalLng);
                } else {
                    await setDrawingPoint(i, finalLat, finalLng, snapId);
                }
                logEditor(`Sync successful for vertex ${i}`);
            } catch (err) {
                logEditor(`Sync failed for vertex ${i}`, err);
            }

            setPreviewCoords(null);
            clearSnap();
        },
        ...({
            touchend: async () => {
                if (draggingIndex === null) return;
                // Touchend doesn't usually have latlng directly, we fall back to the last known preview coords
                const i = draggingIndex;
                map.dragging.enable();
                setDraggingIndex(null);

                const lastCoords = previewCoords ? previewCoords[i] : null;
                if (!lastCoords) {
                    setPreviewCoords(null);
                    clearSnap();
                    return;
                }

                const [lng, lat] = lastCoords;
                let snapped = snappedPointRef.current;
                if (!snapped) snapped = await snapNow(lat, lng, 0.00003);

                const finalLat = snapped ? snapped.y : lat;
                const finalLng = snapped ? snapped.x : lng;
                const snapId = snapped?.id || null;

                // ponytail: restrict SignalLine commit to intersection scope
                if (feature && isSignalLineFeature(feature)) {
                    const parentId = activeParentFeatureId || (getParsedMetadata(feature).parent_feature_id as string | undefined);
                    if (parentId) {
                        const scope = getIntersectionScope(parentId, state?.features || {});
                        if (scope) {
                            let checkLng = finalLng;
                            let checkLat = finalLat;
                            if (snapId && state?.features[snapId]) {
                                const targetFeature = state.features[snapId];
                                const targetCoords = getPointCoordinates(targetFeature);
                                if (targetCoords) {
                                    checkLng = targetCoords[0];
                                    checkLat = targetCoords[1];
                                }
                            }
                            if (!isPointInPolygon([checkLng, checkLat], scope)) {
                                setPreviewCoords(null);
                                clearSnap();
                                return;
                            }
                        }
                    }
                }

                try {
                    if (dragType === 'insert') {
                        await insertDrawingPoint(i, finalLat, finalLng);
                    } else {
                        await setDrawingPoint(i, finalLat, finalLng, snapId);
                    }
                } catch (err) {
                    logEditor(`Sync failed for vertex ${i}`, err);
                }

                setPreviewCoords(null);
                clearSnap();
            }
        } as any)
    });

    const handleContextMenu = useCallback((_: any, i: number) => {
        logEditor(`Delete vertex ${i}`);
        useDesignSync.getState().deleteDrawingPoint(i);
    }, []);

    if (!feature) return null;

    return (
        <>
            {/* Visual Preview Line */}
            {previewCoords && (
                <Polyline
                    positions={previewCoords.map(c => [c[1], c[0]]) as L.LatLngExpression[]}
                    pathOptions={{
                        color: '#3B82F6',
                        weight: 4,
                        dashArray: '10, 10',
                        opacity: 0.8
                    }}
                />
            )}

            {/* Vertex handles rendered at original positions to keep markers stable */}
            {coords.map((c, i) => (
                <VertexMarker
                    key={`vertex-${i}-${editingFeatureId}`}
                    index={i}
                    position={[c[1], c[0]]}
                    onDragStart={handleDragStart}
                    onContextMenu={handleContextMenu}
                />
            ))}

            {/* Mid-point creation handles */}
            {draggingIndex === null && coords.length > 1 && coords.slice(0, -1).map((_, i) => {
                const p1 = coords[i];
                const p2 = coords[i + 1];
                const mid: L.LatLngExpression = [(p1[1] + p2[1]) / 2, (p1[0] + p2[0]) / 2];
                return (
                    <Marker
                        key={`mid-${i}-${editingFeatureId}`}
                        position={mid}
                        interactive={true}
                        draggable={false} // Custom drag implementation
                        icon={new L.DivIcon({
                            className: 'midpoint-handle',
                            html: `<div style="width: 10px; height: 10px; background-color: white; border: 2px solid #3B82F6; border-radius: 50%; opacity: 0.6; pointer-events: auto !important; touch-action: none !important;"></div>`,
                            iconSize: [10, 10],
                            iconAnchor: [5, 5]
                        })}
                        eventHandlers={({
                            mousedown: (e: any) => {
                                L.DomEvent.stopPropagation(e.originalEvent || e);
                                const newPreview = [...coords];
                                newPreview.splice(i + 1, 0, [mid[1], mid[0]]);
                                setPreviewCoords(newPreview);
                                setDragType('insert');
                                setDraggingIndex(i + 1);
                                map.dragging.disable();
                            },
                            touchstart: (e: any) => {
                                L.DomEvent.stopPropagation(e.originalEvent || e);
                                const newPreview = [...coords];
                                newPreview.splice(i + 1, 0, [mid[1], mid[0]]);
                                setPreviewCoords(newPreview);
                                setDragType('insert');
                                setDraggingIndex(i + 1);
                                map.dragging.disable();
                            }
                        }) as any}
                    />
                );
            })}
        </>
    );
};
