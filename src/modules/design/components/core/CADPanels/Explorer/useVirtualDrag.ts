import { useState, useRef, useEffect, useCallback } from "react";
import { DesignEventType } from "@IMPLEMENT/stores/useDesignSync";
import { getParsedMetadata } from "@TOOL/utils/featureUtils";
import type { FeatureGroupState, FeatureState } from "@CONTRACT/types";

interface UseVirtualDragProps {
    featuresRef: React.MutableRefObject<Record<string, FeatureState>>;
    groupsRef: React.MutableRefObject<Record<string, FeatureGroupState>>;
    regionsRef: React.MutableRefObject<Record<string, { id: string; region_id: string; layer_id?: string; layers?: Array<{ id: string }> }>>;
    dispatchEvents: (events: DesignEventType[]) => Promise<void>;
    selectionSet: Set<string>;
    clearSelection: () => void;
}

export function useVirtualDrag({
    featuresRef,
    groupsRef,
    regionsRef,
    dispatchEvents,
    selectionSet,
    clearSelection
}: UseVirtualDragProps) {
    const [isVirtualDragging, setIsVirtualDragging] = useState(false);
    const virtualDragRef = useRef<{
        type: string;
        ids: string[];
        startX: number;
        startY: number;
        lastTarget: HTMLElement | null;
    } | null>(null);

    const draggingIdsRef = useRef<string[]>([]);
    useEffect(() => {
        draggingIdsRef.current = virtualDragRef.current?.ids || [];
    }, [isVirtualDragging]);

    const handleExecuteMove = useCallback((currentDrag: { type: string; ids: string[] }, targetType: 'region' | 'group' | 'feature', targetId: string) => {
        if (!currentDrag || currentDrag.ids.includes(targetId)) return;

        const fMap = featuresRef.current;
        const gMap = groupsRef.current;
        const rMap = regionsRef.current;

        const events: DesignEventType[] = [];
        const timestamp = Date.now();

        currentDrag.ids.forEach((id, index) => {
            const feature = fMap[id];
            const group = gMap[id];
            if (!feature && !group) return;

            if (currentDrag.type === 'feature' && feature) {
                if (targetType === 'region') {
                    const region = rMap[targetId];
                    const targetLayerId = region?.layers?.[0]?.id || region?.layer_id;
                    if (targetLayerId) {
                        events.push({
                            type: 'FeatureUpdated',
                            payload: { id, layer_id: targetLayerId, group_id: "" }
                        });
                    }
                } else if (targetType === 'group') {
                    const targetGroup = gMap[targetId];
                    if (targetGroup) {
                        events.push({
                            type: 'FeatureUpdated',
                            payload: { id, layer_id: targetGroup.layer_id, group_id: targetId }
                        });
                    }
                } else if (targetType === 'feature' && id !== targetId) {
                    const targetFeature = fMap[targetId];
                    if (targetFeature) {
                        const targetOrder = getParsedMetadata(targetFeature).display_order || 0;
                        const newOrder = Number(targetOrder) + 0.001 * (index + 1);
                        events.push({
                            type: 'FeatureUpdated',
                            payload: {
                                id,
                                layer_id: targetFeature.layer_id,
                                group_id: targetFeature.group_id,
                                metadata: JSON.stringify({ ...getParsedMetadata(feature), display_order: newOrder })
                            }
                        });
                    }
                }
            } else if (currentDrag.type === 'group' && group && id !== targetId) {
                const currentMeta = getParsedMetadata(group);
                const newOrder = timestamp + (index * 0.001);

                if (targetType === 'region') {
                    const region = rMap[targetId];
                    const targetLayerId = region?.layers?.[0]?.id || region?.layer_id;
                    if (targetLayerId) {
                        events.push({
                            type: 'FeatureGroupUpdated',
                            payload: {
                                id,
                                name: group.name,
                                is_visible: group.is_visible,
                                metadata: JSON.stringify({ ...currentMeta, parent_id: null, layer_id: targetLayerId, display_order: newOrder })
                            }
                        });
                    }
                } else if (targetType === 'group') {
                    const targetGroup = gMap[targetId];
                    if (targetGroup) {
                        events.push({
                            type: 'FeatureGroupUpdated',
                            payload: {
                                id,
                                name: group.name,
                                is_visible: group.is_visible,
                                metadata: JSON.stringify({ ...currentMeta, parent_id: targetId, layer_id: targetGroup.layer_id, display_order: newOrder })
                            }
                        });
                    }
                }
            }
        });

        if (events.length > 0) {
            dispatchEvents(events);
            clearSelection();
        }
    }, [featuresRef, groupsRef, regionsRef, dispatchEvents, clearSelection]);

    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            const ctx = virtualDragRef.current;
            if (!ctx) return;

            if (!isVirtualDragging) {
                const dist = Math.sqrt(Math.pow(e.clientX - ctx.startX, 2) + Math.pow(e.clientY - ctx.startY, 2));
                if (dist > 5) {
                    setIsVirtualDragging(true);
                    document.body.style.cursor = "grabbing";
                    document.body.style.userSelect = "none";
                }
                return;
            }

            const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
            const target = el?.closest('[data-drag-id]') as HTMLElement;

            if (target && target !== ctx.lastTarget) {
                if (ctx.lastTarget) {
                    ctx.lastTarget.style.outline = "";
                    ctx.lastTarget.style.background = "";
                }
                const tId = target.getAttribute('data-drag-id');
                if (tId && !draggingIdsRef.current.includes(tId)) {
                    target.style.outline = "2px solid #10B981";
                    target.style.background = "rgba(16, 185, 129, 0.1)";
                    ctx.lastTarget = target;
                }
            } else if (!target && ctx.lastTarget) {
                ctx.lastTarget.style.outline = "";
                ctx.lastTarget.style.background = "";
                ctx.lastTarget = null;
            }
        };

        const handleGlobalMouseUp = (e: MouseEvent) => {
            const ctx = virtualDragRef.current;
            if (!ctx) return;

            if (isVirtualDragging) {
                const el = document.elementFromPoint(e.clientX, e.clientY);
                const target = el?.closest('[data-drag-id]');
                if (target) {
                    const tId = target.getAttribute('data-drag-id');
                    const tType = target.getAttribute('data-drag-type') as 'region' | 'group' | 'feature' | null;
                    if (tId && tType) {
                        handleExecuteMove(ctx, tType, tId);
                    }
                }
            }

            if (ctx.lastTarget) {
                ctx.lastTarget.style.outline = "";
                ctx.lastTarget.style.background = "";
            }
            virtualDragRef.current = null;
            setIsVirtualDragging(false);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };

        window.addEventListener('mousemove', handleGlobalMouseMove, true);
        window.addEventListener('mouseup', handleGlobalMouseUp, true);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove, true);
            window.removeEventListener('mouseup', handleGlobalMouseUp, true);
        };
    }, [isVirtualDragging, handleExecuteMove]);

    const handleVirtualDragStart = (e: React.MouseEvent, type: string, id: string) => {
        if (e.button !== 0) return;
        const ids = selectionSet.has(id) ? Array.from(selectionSet) : [id];
        virtualDragRef.current = {
            type,
            ids,
            startX: e.clientX,
            startY: e.clientY,
            lastTarget: null
        };
    };

    return {
        isVirtualDragging,
        handleVirtualDragStart
    };
}
