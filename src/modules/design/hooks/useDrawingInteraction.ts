import { useCallback, useEffect } from "react";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";

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
        currentDrawingSnapIds
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

        const id = crypto.randomUUID();
        const metadata: any = {
            color: '#EF4444'
        };

        if (activeParentFeatureId) {
            metadata.parent_feature_id = activeParentFeatureId;
        }

        const group = selectedGroupId ? state?.feature_groups?.[selectedGroupId] : null;
        if (!group) return;

        await dispatchEvent({
            type: 'FeatureCreated',
            payload: {
                id,
                layer_id: group.layer_id,
                group_id: selectedGroupId,
                name: "Đường Khảo Sát Mới",
                geom_type: 'LineString',
                coordinates: JSON.stringify(currentDrawingPoints),
                metadata: JSON.stringify({
                    ...metadata,
                    start_node_id: currentDrawingSnapIds[0] || null,
                    end_node_id: currentDrawingSnapIds[currentDrawingSnapIds.length - 1] || null
                }),
                properties: JSON.stringify({})
            }
        });

        setDrawingMode('none');
    }, [currentDrawingPoints, selectedGroupId, state, activeParentFeatureId, currentDrawingSnapIds, dispatchEvent, setDrawingMode]);

    const handleLocationChange = useCallback(async (lat: number, lng: number, _unused: number, snapId?: string | null) => {
        if (drawingMode === 'none') return;

        if (drawingMode === 'point' || drawingMode === 'image') {
            if (!selectedGroupId) {
                alert("Vui lòng chọn một nhóm trước khi thêm đối tượng.");
                setDrawingMode('none');
                return;
            }

            const id = crypto.randomUUID();
            const name = drawingMode === 'point' ? "Điểm Khảo Sát Mới" : "Ảnh Hiện Trường Mới";

            const metadata: any = {
                icon: drawingMode === 'image' ? 'camera' : 'default',
                color: '#3B82F6',
                // V2 Fix: Use snap_to_id (read by topology.rs) instead of snapped_object_id (dead data)
                snap_to_id: snapId || undefined,
            };

            if (activeParentFeatureId) {
                metadata.parent_feature_id = activeParentFeatureId;
            }

            const group = selectedGroupId ? state?.feature_groups?.[selectedGroupId] : null;
            if (!group) return;

            await dispatchEvent({
                type: 'FeatureCreated',
                payload: {
                    id,
                    layer_id: group.layer_id,
                    group_id: selectedGroupId,
                    name,
                    geom_type: 'Point',
                    coordinates: JSON.stringify([lng, lat]),
                    metadata: JSON.stringify(metadata),
                    properties: JSON.stringify({})
                }
            });

            setDrawingMode('none');
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
        finalizePolyline
    };
}
