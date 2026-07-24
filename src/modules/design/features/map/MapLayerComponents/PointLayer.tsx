import React, { useEffect, useRef } from 'react';
import { useMap, useMapEvents, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { getIconSvgString, getIntersectionSvgString } from '@DESIGN/components/icons/MapIcons';
import {
    getFeatureDisplayInfo,
    isCameraIcon,
    getPointCoordinates,
    getFeatureMetadataValue,
    safeString,
} from '@TOOL/utils/featureUtils';
import { getParsedMetadata, FeaturePopupContent } from '@DESIGN/features/map/MapLayerComponents/SharedMapComponents';
import { handleFeatureSelection } from "@DESIGN/features/map";
import { confirmUserAction } from '@TOOL/utils/userConfirmation';

const EMPTY_OBJ = {};

const canUseLeafletPanes = (map: L.Map) => {
    try {
        return Boolean((map as any)?._loaded && map.getPane('markerPane'));
    } catch {
        return false;
    }
};

// -------------------------------------------------------------------
// SelectedFeaturePopupManager — unchanged API, same as before
// -------------------------------------------------------------------
export const SelectedFeaturePopupManager = ({
    visibleFeatures,
    selectedFeatureId,
    feature_groups,
    previewMetadata,
    clusterGroupRef,
    moveGroupRef,
    featureNumberMap
}: any) => {
    const selectedPopupLocation = useDesignSync(s => s.selectedPopupLocation);
    const map = useMap();
    const [popupTarget, setPopupTarget] = React.useState<{ pos: [number, number], f: any } | null>(null);

    const updatePopupPosition = React.useCallback(() => {
        if (!selectedFeatureId) {
            setPopupTarget(null);
            return;
        }

        const feature = visibleFeatures.find((f: any) => f.id === selectedFeatureId);
        if (!feature) {
            // Keep previous target if the feature just briefly disappeared from visibleFeatures
            // (e.g. during map movement or state churn)
            return;
        }

        const isPoint = feature.geom_type?.toLowerCase() === 'point' || feature.geom_type === undefined;

        let newPos: [number, number] | null = null;
        let targetFeature = feature;

        // For Points: Try to find the actual marker layer (for clustering awareness)
        if (isPoint && clusterGroupRef.current) {
            const clusterGroup = clusterGroupRef.current;
            const moveGroup = moveGroupRef?.current;

            let layer: any = null;
            if (clusterGroup) {
                layer = clusterGroup.getLayers().find((l: any) => l.options && l.options.featureId === selectedFeatureId);
            }

            if (!layer && moveGroup) {
                layer = moveGroup.getLayers().find((l: any) => l.options && l.options.featureId === selectedFeatureId);
            }

            if (layer) {
                // Check if it's inside a closed cluster
                if (typeof (clusterGroup as any).getVisibleParent === 'function') {
                    const visibleParent = (clusterGroup as any).getVisibleParent(layer);
                    if (visibleParent && visibleParent !== layer) {
                        setPopupTarget(null);
                        return;
                    }
                }
                const latLng = layer.getLatLng();
                newPos = [latLng.lat, latLng.lng];
            }
        }

        // Fallback for Points or primary logic for Vectors: Use captured click location or feature coordinates
        if (!newPos) {
            if (selectedPopupLocation) {
                newPos = [selectedPopupLocation[0], selectedPopupLocation[1]];
            } else {
                const coords = getPointCoordinates(feature);
                if (coords) {
                    newPos = [coords[1], coords[0]];
                }
            }
        }

        if (newPos) {
            const pos = newPos;
            setPopupTarget(prev => {
                if (prev && prev.f.id === targetFeature.id &&
                    Math.abs(prev.pos[0] - pos[0]) < 0.000001 &&
                    Math.abs(prev.pos[1] - pos[1]) < 0.000001) {
                    return prev;
                }
                return { pos, f: targetFeature };
            });
        } else {
            setPopupTarget(null);
        }
    }, [selectedFeatureId, selectedPopupLocation, visibleFeatures, clusterGroupRef]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        updatePopupPosition();
    }, [selectedFeatureId, selectedPopupLocation, visibleFeatures, updatePopupPosition]);

    useMapEvents({
        zoomend: updatePopupPosition,
        moveend: updatePopupPosition,
    });

    useEffect(() => {
        if (!map) return;
        map.on('popup-sync' as any, updatePopupPosition);
        return () => {
            map.off('popup-sync' as any, updatePopupPosition);
        };
    }, [map, updatePopupPosition]);

    if (!popupTarget) return null;

    const { f, pos } = popupTarget;
    const group = f.group_id ? feature_groups[f.group_id] : null;
    const metadata = getParsedMetadata(f, previewMetadata);
    const displayInfo = getFeatureDisplayInfo(f, group?.type, group?.name, metadata);
    const indexInGroup = featureNumberMap[f.id] || "1";

    return (
        <Popup position={pos} className="feature-popup" maxWidth={300} autoPan={false} closeButton={false}>
            <FeaturePopupContent f={f} metadata={metadata} displayType={displayInfo.label} indexInGroup={indexInGroup} />
        </Popup>
    );
};

// -------------------------------------------------------------------
// Helper: create a native Leaflet icon for a feature
// -------------------------------------------------------------------
const createNativeIcon = (
    feature: any,
    group: any,
    metadata: any,
    indexInGroup: string | number,
    isSelected: boolean,
    isClickThrough: boolean
) => {
    const { color, iconKey, isIntersection, isCamera } = getFeatureDisplayInfo(feature, group.type, group.name, metadata);

    const baseSize = metadata.size ? parseInt(String(metadata.size), 10) : 32;
    // Tăng kích thước biểu tượng lên gấp rưỡi để số nằm gọn bên trong
    const size = (isIntersection || isCamera) ? Math.floor(baseSize * 1.5) : baseSize;
    const rawRotation = getFeatureMetadataValue(feature, 'gis.rotation', 'rotation', metadata) ?? 0;
    const rotationStr = (typeof rawRotation === 'string' || typeof rawRotation === 'number') ? String(rawRotation) : '0';
    const rotation = parseFloat(rotationStr);
    const markerColor = safeString(metadata.color) || '#10b981';

    const baseVisualFilter = `filter: saturate(0.96) drop-shadow(0 1px 1px rgba(0,0,0,0.18));`;
    const highlightStyle = isSelected
        ? `outline: 2px solid rgba(34, 211, 238, 0.82); outline-offset: 1px; border-color: rgba(186, 230, 253, 0.92) !important; z-index: 1000;`
        : '';

    let iconHtml = '';
    if (isIntersection) {
        iconHtml = `<div style="position: relative; ${highlightStyle}">${getIntersectionSvgString(color, size, indexInGroup)}</div>`;
    } else if (isCamera) {
        const rawIconType = isCameraIcon(iconKey) ? iconKey : 'cctv';
        iconHtml = `<div style="width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; ${baseVisualFilter} ${highlightStyle}">${getIconSvgString(rawIconType, color, size, indexInGroup, rotation)}</div>`;
    } else {
        iconHtml = `<div style="width: ${size}px; height: ${size}px; background-color: ${markerColor}; border: 1px solid rgba(255,255,255,0.72); border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.16); display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.98); font-weight: 900; font-size: ${Math.max(9, size / 2.8)}px; overflow: hidden; text-shadow: 0 1px 1px rgba(0,0,0,0.35); ${baseVisualFilter} ${highlightStyle}">${indexInGroup}</div>`;
    }


    return new L.DivIcon({
        className: `custom-map-marker leaflet-interactive bg-transparent ${isSelected ? 'selected-marker' : ''} ${isClickThrough ? 'pointer-events-none' : ''}`,
        html: iconHtml,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
}

// -------------------------------------------------------------------
// PointLayer — native Leaflet MarkerClusterGroup, no React children
// -------------------------------------------------------------------
export const PointLayer = React.memo(({
    features,
    feature_groups,
    selectedFeatureId,
    previewMetadata,
    clusterGroupRef,
    moveGroupRef,
    featureNumberMap,
    dispatchEvent: dispatchEventAction
}: any) => {
    const map = useMap();
    const showFeatureGroups = useDesignSync(s => s.showFeatureGroups);
    const groupThemePreview = useDesignSync(s => s.groupThemePreview);
    const drawingMode = useDesignSync(s => s.drawingMode);
    const nativeGroupRef = useRef<L.MarkerClusterGroup | null>(null);
    const moveToolGroupRef = useRef<L.FeatureGroup | null>(null);
    const markersMapRef = useRef<Map<string, L.Marker>>(new Map());
    const isMovingRef = useRef<Map<string, boolean>>(new Map());
    const [groupsReady, setGroupsReady] = React.useState(false);

    useEffect(() => {
        let disposed = false;

        const setupGroups = () => {
            if (disposed || nativeGroupRef.current || !canUseLeafletPanes(map)) return;

            const group = (L as any).markerClusterGroup({
                chunkedLoading: true,
                chunkInterval: 200,
                chunkDelay: 10,
                maxClusterRadius: 50,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                disableClusteringAtZoom: 19,
                animate: false,
            });

            nativeGroupRef.current = group;
            clusterGroupRef.current = group;

            const moveGroup = new L.FeatureGroup();
            moveToolGroupRef.current = moveGroup;

            if (!map.getPane('move-tool-pane')) {
                const pane = map.createPane('move-tool-pane');
                pane.style.zIndex = '1000';
            }

            map.addLayer(group);
            map.addLayer(moveGroup);
            if (moveGroupRef) moveGroupRef.current = moveGroup;
            setGroupsReady(true);

            group.on('animationend spiderfied unspiderfied', () => {
                map.fire('popup-sync');
            });

            group.on('click', (e: any) => {
                if (e.originalEvent) {
                    L.DomEvent.stopPropagation(e.originalEvent);
                }
                const featureId = e.layer?.options?.featureId || e.layer?.featureId;
                const groupId = e.layer?.options?.featureGroupId || e.layer?.featureGroupId;
                if (featureId) {
                    const mode = useDesignSync.getState().drawingMode;
                    if (mode === 'none' || mode === 'move') {
                        handleFeatureSelection(featureId, groupId, e);
                    }
                }
            });

            moveGroup.on('click', (e: any) => {
                if (e.originalEvent) {
                    L.DomEvent.stopPropagation(e.originalEvent);
                }
                const featureId = e.layer?.options?.featureId || e.layer?.featureId;
                const groupId = e.layer?.options?.featureGroupId || e.layer?.featureGroupId;
                if (featureId) {
                    const mode = useDesignSync.getState().drawingMode;
                    if (mode === 'none' || mode === 'move') {
                        handleFeatureSelection(featureId, groupId, e);
                    }
                }
            });
        };

        if (canUseLeafletPanes(map)) {
            setupGroups();
        } else {
            map.whenReady(setupGroups);
        }

        return () => {
            disposed = true;
            if (nativeGroupRef.current && map.hasLayer(nativeGroupRef.current)) {
                map.removeLayer(nativeGroupRef.current);
            }
            if (moveToolGroupRef.current && map.hasLayer(moveToolGroupRef.current)) {
                map.removeLayer(moveToolGroupRef.current);
            }
            nativeGroupRef.current = null;
            moveToolGroupRef.current = null;
            clusterGroupRef.current = null;
            setGroupsReady(false);
            if (moveGroupRef) moveGroupRef.current = null;
            markersMapRef.current.clear();
        };
    }, [map]);

    useEffect(() => {
        const clusterGroup = nativeGroupRef.current;
        const moveGroup = moveToolGroupRef.current;
        if (!clusterGroup || !moveGroup || !canUseLeafletPanes(map)) return;

        const currentIds = new Set<string>();
        const markersMap = markersMapRef.current;
        const isMoveMode = drawingMode === 'move';
        const isClusteringDisabled = !showFeatureGroups;

        for (const f of features) {
            currentIds.add(f.id);
            const grp = feature_groups[f.group_id] || EMPTY_OBJ;
            const coords = getPointCoordinates(f);
            if (!coords) continue;

            const metadata = getParsedMetadata(f, previewMetadata, groupThemePreview);
            const isSelected = f.id === selectedFeatureId;
            const isSelectedForMove = isMoveMode && isSelected;
            const indexInGroup = featureNumberMap[f.id] || "1";
            const isClickThrough = drawingMode !== 'none' && drawingMode !== 'move';

            const targetGroup = (isSelectedForMove || isClusteringDisabled) ? moveGroup : clusterGroup;
            const targetPane = (isSelectedForMove || isClusteringDisabled) ? 'move-tool-pane' : 'markerPane';

            let marker = markersMap.get(f.id);

            if (!marker) {
                const icon = createNativeIcon(f, grp, metadata, indexInGroup, isSelected, isClickThrough);
                marker = L.marker([coords[1], coords[0]], {
                    icon,
                    interactive: !isClickThrough,
                    draggable: isSelectedForMove,
                    featureId: f.id,
                    featureGroupId: f.group_id,
                    pane: targetPane
                } as any);

                if (isSelectedForMove) {
                    marker.on('dragstart', () => isMovingRef.current.set(f.id, true));
                    marker.on('dragend', async (e: any) => {
                        try {
                            isMovingRef.current.delete(f.id);
                            const { lat, lng } = e.target.getLatLng();
                            if (!(await confirmUserAction(`Xác nhận di chuyển đối tượng "${f.name}" đến vị trí mới?`))) {
                                e.target.setLatLng([coords[1], coords[0]]);
                                return;
                            }
                            if (dispatchEventAction) {
                                await dispatchEventAction({
                                    type: 'FeatureUpdated',
                                    payload: { id: f.id, coordinates: [lng, lat] }
                                });
                            }
                        } catch (err) {
                            console.error('[PointLayer] Drag end sync failed (initial):', err);
                        }
                    });
                }

                (marker as any)._group = targetGroup;
                if (!canUseLeafletPanes(map)) {
                    continue;
                }
                targetGroup.addLayer(marker);
                markersMap.set(f.id, marker);
            } else {
                const currentGroup = (marker as any)._group;
                const currentPane = (marker.options as any).pane;

                if (!isMovingRef.current.has(f.id)) {
                    marker.setLatLng([coords[1], coords[0]]);
                }

                const icon = createNativeIcon(f, grp, metadata, indexInGroup, isSelected, isClickThrough);
                marker.setIcon(icon);
                (marker.options as any).interactive = !isClickThrough;

                if (marker.dragging) {
                    if (isSelectedForMove) {
                        marker.dragging.enable();
                        marker.off('dragstart dragend');
                        marker.on('dragstart', () => isMovingRef.current.set(f.id, true));
                        marker.on('dragend', async (ev: any) => {
                            try {
                                isMovingRef.current.delete(f.id);
                                const ll = ev.target.getLatLng();
                                if (!(await confirmUserAction(`Xác nhận di chuyển đối tượng "${f.name}" đến vị trí mới?`))) {
                                    ev.target.setLatLng([coords[1], coords[0]]);
                                    return;
                                }
                                if (dispatchEventAction) {
                                    await dispatchEventAction({
                                        type: 'FeatureUpdated',
                                        payload: { id: f.id, coordinates: [ll.lng, ll.lat] }
                                    });
                                }
                            } catch (err) {
                                console.error('[PointLayer] Drag end sync failed (update):', err);
                            }
                        });
                    } else {
                        marker.dragging.disable();
                        marker.off('dragstart dragend');
                    }
                }

                if (currentGroup !== targetGroup || currentPane !== targetPane) {
                    currentGroup.removeLayer(marker);
                    (marker.options as any).pane = targetPane;
                    if (!canUseLeafletPanes(map)) {
                        continue;
                    }
                    targetGroup.addLayer(marker);
                    (marker as any)._group = targetGroup;
                }
            }
        }

        for (const [id, marker] of markersMap) {
            if (!currentIds.has(id)) {
                (marker as any)._group?.removeLayer(marker);
                markersMap.delete(id);
            }
        }
    }, [
        features,
        showFeatureGroups,
        drawingMode,
        selectedFeatureId,
        featureNumberMap,
        previewMetadata,
        feature_groups,
        groupThemePreview,
        dispatchEventAction,
        map,
        groupsReady
    ]);

    return null;
});
