import { useCallback, useEffect } from "react";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { getNextFeatureDisplayOrder, syncDisplayOrderAliases } from "@TOOL/utils/featureMapping";
import { getParsedMetadata } from "@TOOL/utils/featureMetadata";
import { buildFeatureCreatedPayload } from "@TOOL/utils/featurePersistence";
import { getNetworkEndpointCoordinate, getRepresentativeFeatureIdForEndpoint } from "@DESIGN/features/map/network/NetworkEndpoint";
import { buildSnapLinks, inferNetworkRole, isSourceRole, resolveNetworkNodeIdFromSnap } from "@DESIGN/features/map/network/networkTopology";
import { confirmUserAction } from "@TOOL/utils/userConfirmation";

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
        projectId,
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
        queueEvent,
        queueEvents,
    } = useDesignSync();

    const finalizePolyline = useCallback(async () => {
        const featuresById = state?.features || {};
        const workingPoints = [...currentDrawingPoints];
        const workingSnapIds = [...currentDrawingSnapIds];

        if (networkConnectionDraft) {
            const startCoordinate = getNetworkEndpointCoordinate(networkConnectionDraft.fromEndpoint, featuresById);
            const endCoordinate = getNetworkEndpointCoordinate(networkConnectionDraft.toEndpoint, featuresById);
            const startSnapId = getRepresentativeFeatureIdForEndpoint(networkConnectionDraft.fromEndpoint, featuresById);
            const endSnapId = getRepresentativeFeatureIdForEndpoint(networkConnectionDraft.toEndpoint, featuresById);

            if (startCoordinate && startSnapId && (workingSnapIds[0] || null) !== startSnapId) {
                workingPoints.unshift(startCoordinate);
                workingSnapIds.unshift(startSnapId);
            }

            if (endCoordinate && endSnapId && (workingSnapIds[workingSnapIds.length - 1] || null) !== endSnapId) {
                workingPoints.push(endCoordinate);
                workingSnapIds.push(endSnapId);
            }
        }

        if (workingPoints.length < 2) {
            alert("Cần ít nhất 2 điểm để tạo đường.");
            return;
        }

        if (!selectedGroupId) {
            alert("Vui lòng chọn một nhóm trước khi lưu.");
            return;
        }

        const startSnapId = workingSnapIds[0] || null;
        const endSnapId = workingSnapIds[workingSnapIds.length - 1] || null;

        if (!startSnapId || !featuresById[startSnapId]) {
            alert("Không thể lưu polyline vì đầu bắt đầu chưa kết nối vào đối tượng hợp lệ.");
            return;
        }

        if (!endSnapId || !featuresById[endSnapId]) {
            alert("Không thể lưu polyline vì đầu kết thúc chưa kết nối vào đối tượng hợp lệ.");
            return;
        }

        const id = crypto.randomUUID();
        const metadata: any = syncDisplayOrderAliases({
            color: '#EF4444',
        }, getNextFeatureDisplayOrder(
            featuresById,
            selectedGroupId,
            activeParentFeatureId
        ));

        if (activeParentFeatureId) {
            metadata.parent_feature_id = activeParentFeatureId;
        }

        const group = selectedGroupId ? state?.feature_groups?.[selectedGroupId] : null;
        if (!group) return;

        const resolvedStartNetworkNodeId = resolveNetworkNodeIdFromSnap(featuresById, startSnapId, workingPoints[0] || null);
        const resolvedEndNetworkNodeId = resolveNetworkNodeIdFromSnap(featuresById, endSnapId, workingPoints[workingPoints.length - 1] || null);
        const shouldCreateNetworkEdge = !!resolvedStartNetworkNodeId &&
            !!resolvedEndNetworkNodeId &&
            resolvedStartNetworkNodeId !== resolvedEndNetworkNodeId;

        const finalMetadata: any = {
            ...metadata,
            start_node_id: startSnapId,
            end_node_id: endSnapId,
            manual_override: true,
            infrastructure: {
                ...(metadata.infrastructure || {}),
                type: 'SignalLine',
            },
        };

        const snapLinks = buildSnapLinks(workingSnapIds);
        if (snapLinks) {
            finalMetadata.snap_links = snapLinks;
        }

        if (shouldCreateNetworkEdge) {
            const fromEndpoint = networkConnectionDraft?.fromEndpoint || null;
            const toEndpoint = networkConnectionDraft?.toEndpoint || null;
            const fromRepresentativeId = fromEndpoint
                ? getRepresentativeFeatureIdForEndpoint(fromEndpoint, featuresById)
                : null;
            const toRepresentativeId = toEndpoint
                ? getRepresentativeFeatureIdForEndpoint(toEndpoint, featuresById)
                : null;
            finalMetadata.network = {
                ...(finalMetadata.network || {}),
                from_feature_id: fromEndpoint?.type === 'feature'
                    ? fromEndpoint.id
                    : (resolvedStartNetworkNodeId || fromRepresentativeId),
                to_feature_id: toEndpoint?.type === 'feature'
                    ? toEndpoint.id
                    : (resolvedEndNetworkNodeId || toRepresentativeId),
                ...(fromEndpoint ? { from_endpoint: fromEndpoint } : {}),
                ...(toEndpoint ? { to_endpoint: toEndpoint } : {}),
                direction_mode: 'auto',
            };
        }

        const events: any[] = [];

        if (shouldCreateNetworkEdge) {
            const resolvedStartFeature = featuresById[resolvedStartNetworkNodeId!];
            const resolvedEndFeature = featuresById[resolvedEndNetworkNodeId!];
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
            payload: buildFeatureCreatedPayload({
                id,
                layer_id: group.layer_id,
                group_id: selectedGroupId,
                name: shouldCreateNetworkEdge ? "Tuyến SignalLine Mới" : "Đường Khảo Sát Mới",
                geom_type: 'LineString',
                coordinates: workingPoints,
                metadata: finalMetadata,
            })
        } as any);

        events.push({
            type: 'FiberCableUpserted',
            payload: {
                id,
                project_id: String(projectId || ''),
                feature_id: id,
                cable_type: null,
                fiber_count: null,
                owner: null,
                status: 'planned',
                source: 'manual',
            },
        } as any);

        if (!(await confirmUserAction('Xác nhận thêm tuyến mới với các điểm và liên kết hiện tại?'))) return;

        if (events.length > 1) {
            await queueEvents(events);
        } else {
            await queueEvent(events[0]);
        }

        setDrawingMode('none');
        clearNetworkConnectionDraft();
    }, [currentDrawingPoints, selectedGroupId, state, projectId, activeParentFeatureId, currentDrawingSnapIds, dispatchEvent, dispatchEvents, queueEvent, queueEvents, setDrawingMode, networkConnectionDraft, clearNetworkConnectionDraft]);

    const finishDrawingSession = useCallback(() => {
        if (drawingMode === 'polyline' && (networkConnectionDraft || currentDrawingPoints.length >= 2)) {
            void finalizePolyline();
            return;
        }
        setDrawingMode('none');
        clearNetworkConnectionDraft();
    }, [clearNetworkConnectionDraft, currentDrawingPoints.length, drawingMode, finalizePolyline, networkConnectionDraft, setDrawingMode]);

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

            if (!(await confirmUserAction(`Xác nhận thêm "${defaults.name}" tại vị trí đã chọn?`))) return;

            await dispatchEvent({
                type: 'FeatureCreated',
                payload: buildFeatureCreatedPayload({
                    id: crypto.randomUUID(),
                    layer_id: group.layer_id,
                    group_id: selectedGroupId,
                    name: defaults.name,
                    geom_type: 'Point',
                    coordinates: [lng, lat],
                    metadata,
                })
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
