import React from 'react';
import { Polyline, Polygon, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import {
    getFeatureDisplayInfo,
    getParsedCoordinates,
    getRepresentativePoint,
    safeString
} from '@TOOL/utils/featureUtils';
import { getParsedMetadata } from '@DESIGN/features/map/MapLayerComponents/SharedMapComponents';
import { handleFeatureSelection, stopFeatureEventPropagation } from '@DESIGN/features/map';

export const VectorLayer = React.memo(({
    features,
    allFeatures = {},
    parentChildMap,
    featureHierarchy,
    feature_groups,
    selectedFeatureId,
    previewMetadata,
    currentZoom,
    zoomTo
}: any) => {
    const drawingMode = useDesignSync(s => s.drawingMode);
    const editingFeatureId = useDesignSync(s => s.editingFeatureId);
    const groupThemePreview = useDesignSync(s => s.groupThemePreview);
    const isClickThrough = drawingMode !== 'none' && drawingMode !== 'move';

    const getVectorEventHandlers = React.useCallback((featureId: string, groupId: string, isEditingFeature = false) => ({
        click: (e: any) => {
            const mode = useDesignSync.getState().drawingMode;
            if (mode === 'none' || mode === 'move') {
                stopFeatureEventPropagation(e);
                handleFeatureSelection(featureId, groupId, e);
            }
        },
        mouseover: () => {
            const mode = useDesignSync.getState().drawingMode;
            if (mode === 'none' || mode === 'move') {
                useDesignSync.getState().setHoverId(featureId);
            }
        },
        mouseout: () => {
            useDesignSync.getState().setHoverId(null);
        },
        dblclick: (e: any) => {
            if (!isEditingFeature) {
                const mode = useDesignSync.getState().drawingMode;
                if (mode === 'none' || mode === 'move') {
                    L.DomEvent.stopPropagation((e as any).originalEvent || e);
                    zoomTo(featureId, 'feature');
                }
            }
        }
    }), [zoomTo]);

    return (
        <>
            {features.map((f: any) => {
                const geomType = (f.geom_type || '').toLowerCase();
                if (geomType === 'point' || geomType === '' || geomType === 'default') return null;

                const group = feature_groups ? feature_groups[f.group_id] : null;
                const metadata = getParsedMetadata(f, previewMetadata, groupThemePreview);
                let coords = getParsedCoordinates(f);

                const isLine = geomType === 'linestring' || geomType === 'polyline' || geomType === 'line';
                const isPolygon = geomType === 'polygon';
                const isSelected = f.id === selectedFeatureId;

                if (isLine || isPolygon) {
                    const depth = featureHierarchy?.depthMap?.[f.id] ?? (metadata.parent_feature_id ? 1 : 0);
                    const expansionZoom = 19 + (depth * 2);
                    const parentExpansionZoom = depth > 0 ? 19 + ((depth - 1) * 2) : 0;
                    const isInsideIntersectionGroup = String(group?.type || '').toUpperCase() === 'INTERSECTION';

                    if (depth > 0 && Number(currentZoom) < parentExpansionZoom && !isSelected) return null;
                    if (depth === 0 && isInsideIntersectionGroup && Number(currentZoom) < expansionZoom && !isSelected) return null;
                }

                // V4 Fix: Coordinate Aggregation for Parents
                // If a Polyline/Polygon has no internal coordinates, try to build them from children
                if ((!coords || coords.length === 0) && (isLine || isPolygon)) {
                    const parentId = String(f.id);
                    const childIds = parentChildMap?.get(parentId) || [];

                    const children = childIds
                        .map((cid: string) => (allFeatures as any)[cid])
                        .filter(Boolean)
                        .sort((a: any, b: any) => {
                            const metaA = getParsedMetadata(a, previewMetadata, groupThemePreview);
                            const metaB = getParsedMetadata(b, previewMetadata, groupThemePreview);
                            return (Number(metaA.display_order) ?? 0) - (Number(metaB.display_order) ?? 0) ||
                                String(a.name).localeCompare(String(b.name));
                        });

                    if (children.length > 0) {
                        coords = children
                            .map((child: any) => getRepresentativePoint(child))
                            .filter((c: any) => Array.isArray(c) && c.length >= 2) as any;
                    }
                }

                if (!coords || !Array.isArray(coords)) return null;

                const displayInfo = getFeatureDisplayInfo(f, group?.type, group?.name, metadata);
                const isEditing = f.id === editingFeatureId;

                if (isLine) {
                    let latLngs: [number, number][] = [];
                    if (coords && Array.isArray(coords)) {
                        if (Array.isArray(coords[0])) {
                            // Standard Multi-point [[lng, lat], ...]
                            latLngs = coords
                                .map((c: any) => Array.isArray(c) && c.length >= 2 ? [Number(c[1]), Number(c[0])] as [number, number] : null)
                                .filter((c: [number, number] | null): c is [number, number] => c !== null);
                        } else if (coords.length >= 2) {
                            // V4 Fix: Handle Flat Array [x1, y1, x2, y2, ...]
                            if (coords.length > 2 && coords.every(c => typeof c === 'number')) {
                                for (let i = 0; i < coords.length; i += 2) {
                                    if (coords[i + 1] !== undefined) {
                                        latLngs.push([coords[i + 1], coords[i]]);
                                    }
                                }
                                console.warn(`[VectorLayer] Detected FLAT coordinate array for ${f.name}. Normalized into ${latLngs.length} points.`);
                            } else {
                                // Single segment polyline from direct coords [lng, lat]
                                latLngs = [[Number(coords[1]), Number(coords[0])]];
                            }
                        }
                    }

                    if (latLngs.length === 0) {
                        console.warn(`[VectorLayer] ⚠️ Polyline ${f.name || f.id} has 0 latLngs after processing. Coords:`, coords);
                        return null;
                    }

                    const baseWeight = Number(metadata.weight || metadata.size || metadata.stroke || 0);
                    const lineColor = safeString(metadata.color) || '#10b981';
                    const weight = isSelected
                        ? (baseWeight ? baseWeight + 4 : 8)
                        : (baseWeight ? baseWeight : 5); // Increased default from 2 to 5

                    if (latLngs.length === 1) {
                        return (
                            <CircleMarker
                                key={f.id}
                                center={latLngs[0]}
                                radius={Math.max(4, weight)}
                                pathOptions={{
                                    fillColor: isSelected ? '#22d3ee' : lineColor,
                                    fillOpacity: isSelected ? 0.72 : 0.58,
                                    color: (f.id === selectedFeatureId) ? '#c7f9ff' : lineColor,
                                    weight: (f.id === selectedFeatureId) ? 2 : 1,
                                    className: isClickThrough ? 'pointer-events-none' : 'cursor-pointer'
                                }}
                                interactive={drawingMode === 'none' || drawingMode === 'move'}
                                eventHandlers={{
                                    click: (e) => {
                                        const mode = useDesignSync.getState().drawingMode;
                                        if (mode === 'none' || mode === 'move') {
                                            stopFeatureEventPropagation(e);
                                            handleFeatureSelection(f.id, f.group_id, e);
                                        }
                                    },
                                    mouseover: () => {
                                        if (drawingMode === 'none' || drawingMode === 'move') {
                                            useDesignSync.getState().setHoverId(f.id);
                                        }
                                    },
                                    mouseout: () => {
                                        if (drawingMode === 'none' || drawingMode === 'move') {
                                            useDesignSync.getState().setHoverId(null);
                                        }
                                    }
                                }}
                            >
                            </CircleMarker>
                        );
                    }

                    return (
                        <React.Fragment key={f.id}>
                            {/* Hit Area (Invisible, wide) */}
                            <Polyline
                                positions={latLngs}
                                pathOptions={{
                                    color: 'transparent',
                                    weight: Math.max(15, weight + 5),
                                    className: isClickThrough ? 'pointer-events-none' : 'cursor-pointer'
                                }}
                                interactive={drawingMode === 'none' || drawingMode === 'move'}
                                eventHandlers={getVectorEventHandlers(f.id, f.group_id, isEditing)}
                            />
                            {/* Visible Polyline */}
                            <Polyline
                                positions={latLngs}
                                pathOptions={{
                                    color: isSelected ? '#22d3ee' : (displayInfo.color || '#EF4444'),
                                    weight: weight,
                                    opacity: isSelected ? 0.82 : 0.72,
                                    lineCap: 'round',
                                    lineJoin: 'round',
                                    dashArray: isSelected ? '10, 10' : undefined,
                                    className: `${isClickThrough ? 'pointer-events-none' : 'cursor-pointer'} ${isSelected ? 'polyline-selected' : ''}`
                                }}
                                interactive={drawingMode === 'none' || drawingMode === 'move'}
                                eventHandlers={getVectorEventHandlers(f.id, f.group_id, isEditing)}
                            />
                        </React.Fragment>
                    );
                }
                else if (geomType === 'polygon') {
                    const latLngs = (Array.isArray(coords[0]) ? coords : [coords]).map((r: any) =>
                        (r as any[]).map((c: any) => [Number(c[1]), Number(c[0])] as [number, number])
                    );
                    return (
                        <Polygon
                            key={f.id}
                            positions={latLngs}
                            pathOptions={{
                                color: displayInfo.color || '#EF4444',
                                weight: isSelected ? 3 : 2,
                                fillOpacity: isSelected ? 0.22 : 0.08,
                                fillColor: displayInfo.color || '#EF4444',
                                opacity: isSelected ? 0.82 : 0.68,
                                dashArray: isSelected ? '6, 6' : undefined,
                                className: isClickThrough ? 'pointer-events-none' : ''
                            }}
                            interactive={drawingMode === 'none' || drawingMode === 'move'}
                            eventHandlers={getVectorEventHandlers(f.id, f.group_id, isEditing)}
                        />
                    );
                }
                return null;
            })}
        </>
    );
});
