import { useCallback, useEffect } from "react";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { getNextFeatureDisplayOrder, syncDisplayOrderAliases } from "@TOOL/utils/featureMapping";
import { getParsedMetadata } from "@TOOL/utils/featureMetadata";
import { buildSnapLinks, inferNetworkRole, isSourceRole, resolveNetworkNodeIdFromSnap } from "@DESIGN/features/map/network/networkTopology";

type OneClickDrawingMode = 'point' | 'image' | 'intersection';

const ONE_CLICK_DRAWING_MODES = new Set<string>(['point', 'image', 'intersection']);

const getOneClickDefaults = (mode: OneClickDrawingMode) => {
    switch (mode) {
        case 'image':
            return {
                name: "Ảnh Hiện Trường Mới",
                icon: 'cctv',
                type: 'cctv',
                color: '#3B82F6'
            };
        case 'intersection':
            return {
                name: "Nút Giao Mới",
                icon: 'intersection',
                type: 'intersection',
                color: '#6366F1'
            };
        case 'point':
        default:
            return {
                name: "Điểm Khảo Sát Mới",
                icon: 'default',
                type: 'point',
                color: '#3B82F6'
            };
    }
};

export function useDrawingInteraction() {
    const {
        state,
        drawingMode,
        selectedGroupId,
        activeParentFeatureId,
        dispatchEvent,
        setDrawingMode,
        addDrawingPoint,
        currentDrawingPoints,
        currentDrawingSnapIds,
        networkConnectionDraft,
        clearNetworkConnectionDraft,
        dispatchEvents,
    } = useDesignSync();

    const finalizePolyline = useCallback(async () => {
        if (currentDrawingPoints.length < 2) {
            alert("Cần ít nhất 2 điểm để tạo đường.");
            return;
        }

        if (!selectedGroupId) {
            alert("Vui lòng chọn một nhóm trước khi lưu.");
            return;
        }

        const startSnapId = currentDrawingSnapIds[0] || null;
        const endSnapId = currentDrawingSnapIds[currentDrawingSnapIds.length - 1] || null;

        if (!startSnapId || !state?.features?.[startSnapId]) {
            alert("Không thể lưu polyline vì đầu bắt đầu chưa kết nối vào đối tượng hợp lệ.");
            return;
        }

        if (!endSnapId || !state?.features?.[endSnapId]) {
            alert("Không thể lưu polyline vì đầu kết thúc chưa kết nối vào đối tượng hợp lệ.");
            return;
        }

        const id = crypto.randomUUID();
        const metadata: any = syncDisplayOrderAliases({
            color: '#EF4444',
        }, getNextFeatureDisplayOrder(
            state?.features || {},
            selectedGroupId,
            activeParentFeatureId
        ));

        if (activeParentFeatureId) {
            metadata.parent_feature_id = activeParentFeatureId;
        }

        const group = selectedGroupId ? state?.feature_groups?.[selectedGroupId] : null;
        if (!group) return;

        const resolvedStartNetworkNodeId = resolveNetworkNodeIdFromSnap(state.features, startSnapId, currentDrawingPoints[0] || null);
        const resolvedEndNetworkNodeId = resolveNetworkNodeIdFromSnap(state.features, endSnapId, currentDrawingPoints[currentDrawingPoints.length - 1] || null);
        const shouldCreateNetworkEdge = !!resolvedStartNetworkNodeId &&
            !!resolvedEndNetworkNodeId &&
            resolvedStartNetworkNodeId !== resolvedEndNetworkNodeId;

        const finalMetadata: any = {
            ...metadata,
            start_node_id: startSnapId,
            end_node_id: endSnapId,
        };

        const snapLinks = buildSnapLinks(currentDrawingSnapIds);
        if (snapLinks) {
            finalMetadata.snap_links = snapLinks;
        }

        if (shouldCreateNetworkEdge) {
            finalMetadata.infrastructure = {
                ...(finalMetadata.infrastructure || {}),
                type: 'SignalLine'
            };
            finalMetadata.network = {
                ...(finalMetadata.network || {}),
                from_feature_id: networkConnectionDraft?.fromFeatureId || resolvedStartNetworkNodeId,
                to_feature_id: networkConnectionDraft?.toFeatureId || resolvedEndNetworkNodeId,
                direction_mode: 'auto',
            };
        }

        const events: any[] = [];

        if (shouldCreateNetworkEdge) {
            const resolvedStartFeature = state.features[resolvedStartNetworkNodeId!];
            const resolvedEndFeature = state.features[resolvedEndNetworkNodeId!];
            const startMeta = getParsedMetadata(resolvedStartFeature) as Record<string, any>;
            const endMeta = getParsedMetadata(resolvedEndFeature) as Record<string, any>;
            const startRole = inferNetworkRole(resolvedStartFeature, startMeta as any);
            const endRole = inferNetworkRole(resolvedEndFeature, endMeta as any);
            const sourceFeature = isSourceRole(startRole) && !isSourceRole(endRole)
                ? resolvedStartFeature
                : isSourceRole(endRole) && !isSourceRole(startRole)
                    ? resolvedEndFeature
                    : null;
            const deviceFeature = sourceFeature?.id === resolvedStartFeature.id ? resolvedEndFeature : sourceFeature?.id === resolvedEndFeature.id ? resolvedStartFeature : null;

            if (sourceFeature && deviceFeature) {
                const deviceMeta = { ...(getParsedMetadata(deviceFeature) as Record<string, any>) };
                if (deviceMeta.parent_feature_id !== sourceFeature.id) {
                    deviceMeta.parent_feature_id = sourceFeature.id;
                    events.push({
                        type: 'FeatureUpdated',
                        payload: {
                            id: deviceFeature.id,
                            metadata: JSON.stringify(deviceMeta),
                        },
                    });
                }
            }
        }

        events.push({
            type: 'FeatureCreated',
            payload: {
                id,
                layer_id: group.layer_id,
                group_id: selectedGroupId,
                name: shouldCreateNetworkEdge ? "Tuyến SignalLine Mới" : "Đường Khảo Sát Mới",
                geom_type: 'LineString',
                coordinates: JSON.stringify(currentDrawingPoints),
                metadata: JSON.stringify(finalMetadata),
                properties: JSON.stringify({})
            }
        } as any);

        if (events.length > 1) {
            await dispatchEvents(events);
        } else {
            await dispatchEvent(events[0]);
        }

        setDrawingMode('none');
        clearNetworkConnectionDraft();
    }, [currentDrawingPoints, selectedGroupId, state, activeParentFeatureId, currentDrawingSnapIds, dispatchEvent, dispatchEvents, setDrawingMode, networkConnectionDraft, clearNetworkConnectionDraft]);

    const finishDrawingSession = useCallback(() => {
        setDrawingMode('none');
        clearNetworkConnectionDraft();
    }, [setDrawingMode, clearNetworkConnectionDraft]);

    const handleLocationChange = useCallback(async (lat: number, lng: number, _unused: number, snapId?: string | null) => {
        if (drawingMode === 'none') return;

        if (ONE_CLICK_DRAWING_MODES.has(drawingMode)) {
            if (!selectedGroupId) {
                alert("Vui lòng chọn một nhóm trước khi thêm đối tượng.");
                setDrawingMode('none');
                return;
            }

            const mode = drawingMode as OneClickDrawingMode;
            const defaults = getOneClickDefaults(mode);

            const metadata: any = syncDisplayOrderAliases({
                icon: defaults.icon,
                type: defaults.type,
                color: defaults.color,
                // V2 Fix: Use snap_to_id (read by topology.rs) instead of snapped_object_id (dead data)
                snap_to_id: snapId || undefined,
            }, getNextFeatureDisplayOrder(
                state?.features || {},
                selectedGroupId,
                activeParentFeatureId
            ));

            if (activeParentFeatureId) {
                metadata.parent_feature_id = activeParentFeatureId;
            }

            const group = selectedGroupId ? state?.feature_groups?.[selectedGroupId] : null;
            if (!group) return;

            await dispatchEvent({
                type: 'FeatureCreated',
                payload: {
                    id: crypto.randomUUID(),
                    layer_id: group.layer_id,
                    group_id: selectedGroupId,
                    name: defaults.name,
                    geom_type: 'Point',
                    coordinates: JSON.stringify([lng, lat]),
                    metadata: JSON.stringify(metadata),
                    properties: JSON.stringify({})
                }
            } as any);
        } else if (drawingMode === 'polyline') {
            addDrawingPoint(lat, lng, snapId);
        }
    }, [drawingMode, selectedGroupId, state, activeParentFeatureId, dispatchEvent, setDrawingMode, addDrawingPoint]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && drawingMode === 'polyline') {
                finalizePolyline();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [drawingMode, finalizePolyline]);

    return {
        handleLocationChange,
        finalizePolyline,
        finishDrawingSession
    };
}
