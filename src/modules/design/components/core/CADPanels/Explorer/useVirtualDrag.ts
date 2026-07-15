import { useState, useRef, useEffect, useCallback } from "react";
import { DesignEventType } from "@IMPLEMENT/stores/useDesignSync";
import { getFeatureDisplayInfo, getNextFeatureDisplayOrder, getParsedMetadata, syncDisplayOrderAliases } from "@TOOL/utils/featureUtils";
import type { FeatureGroupState, FeatureState } from "@CONTRACT/types";

interface UseVirtualDragProps {
    featuresRef: React.MutableRefObject<Record<string, FeatureState>>;
    groupsRef: React.MutableRefObject<Record<string, FeatureGroupState>>;
    regionsRef: React.MutableRefObject<Record<string, { id: string; region_id: string; layer_id?: string; layers?: Array<{ id: string }> }>>;
    dispatchEvents: (events: DesignEventType[]) => Promise<void>;
    selectionSet: Set<string>;
    clearSelection: () => void;
}

const buildMovedFeatureMetadata = (
    feature: FeatureState,
    featuresMap: Record<string, FeatureState>,
    groupId: string | null,
    parentFeatureId?: string | null
) => {
    const metadata = { ...getParsedMetadata(feature) };
    const displayOrder = getNextFeatureDisplayOrder(featuresMap, groupId, parentFeatureId);

    if (parentFeatureId) {
        metadata.parent_feature_id = parentFeatureId;
    } else {
        delete metadata.parent_feature_id;
    }

    return syncDisplayOrderAliases(metadata, displayOrder, feature.properties);
};

const logDragDrop = (step: string, details?: Record<string, unknown>) => {
    console.debug(`[ExplorerDragDrop] ${step}`, details || {});
};

const getDragTargetInfo = (
    x: number,
    y: number,
    fallbackTarget?: HTMLElement | null
) => {
    const elements = document.elementsFromPoint(x, y);
    const validFallback = fallbackTarget?.isConnected &&
        fallbackTarget.hasAttribute('data-drag-id') &&
        fallbackTarget.hasAttribute('data-drag-type')
        ? fallbackTarget
        : null;
    const target = elements
        .map(el => el.closest('[data-drag-id][data-drag-type]') as HTMLElement | null)
        .find(Boolean) || validFallback || null;
    const targetId = target?.getAttribute('data-drag-id') || null;
    const targetType = target?.getAttribute('data-drag-type') as 'region' | 'group' | 'feature' | null;

    return {
        elementsCount: elements.length,
        fallbackUsed: Boolean(validFallback && target === validFallback),
        target,
        targetId,
        targetType
    };
};

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
        logDragDrop("execute:start", { dragType: currentDrag?.type, ids: currentDrag?.ids, targetType, targetId });
        if (!currentDrag) {
            logDragDrop("execute:skip:no-current-drag");
            return;
        }
        if (currentDrag.ids.includes(targetId)) {
            logDragDrop("execute:skip:self-target", { targetId, ids: currentDrag.ids });
            return;
        }

        const fMap = featuresRef.current;
        const nextFeaturesMap = { ...fMap };
        const gMap = groupsRef.current;
        const rMap = regionsRef.current;

        const events: DesignEventType[] = [];
        const timestamp = Date.now();

        currentDrag.ids.forEach((id, index) => {
            const feature = fMap[id];
            const group = gMap[id];
            if (!feature && !group) {
                logDragDrop("execute:skip:missing-source", { id, dragType: currentDrag.type });
                return;
            }

            if (currentDrag.type === 'feature' && feature) {
                if (targetType === 'region') {
                    const region = rMap[targetId];
                    const targetLayerId = region?.layers?.[0]?.id || region?.layer_id;
                    logDragDrop("execute:feature-to-region", { id, targetId, targetLayerId });
                    if (targetLayerId) {
                        const nextMetadata = buildMovedFeatureMetadata(feature, nextFeaturesMap, null, null);
                        events.push({
                            type: 'FeatureUpdated',
                            payload: {
                                id,
                                layer_id: targetLayerId,
                                group_id: "",
                                metadata: JSON.stringify(nextMetadata)
                            }
                        });
                        nextFeaturesMap[id] = {
                            ...feature,
                            layer_id: targetLayerId,
                            group_id: "",
                            metadata: nextMetadata
                        };
                    }
                } else if (targetType === 'group') {
                    const targetGroup = gMap[targetId];
                    logDragDrop("execute:feature-to-group", { id, targetId, targetLayerId: targetGroup?.layer_id });
                    if (targetGroup) {
                        const nextMetadata = buildMovedFeatureMetadata(feature, nextFeaturesMap, targetId, null);
                        events.push({
                            type: 'FeatureUpdated',
                            payload: {
                                id,
                                layer_id: targetGroup.layer_id,
                                group_id: targetId,
                                metadata: JSON.stringify(nextMetadata)
                            }
                        });
                        nextFeaturesMap[id] = {
                            ...feature,
                            layer_id: targetGroup.layer_id,
                            group_id: targetId,
                            metadata: nextMetadata
                        };
                    }
                } else if (targetType === 'feature' && id !== targetId) {
                    const targetFeature = fMap[targetId];
                    logDragDrop("execute:feature-to-feature", { id, targetId, targetExists: Boolean(targetFeature) });
                    if (targetFeature) {
                        const targetMeta = getParsedMetadata(targetFeature);
                        const parentFeatureId = getFeatureDisplayInfo(targetFeature).isIntersection
                            ? targetFeature.id
                            : targetMeta.parent_feature_id ? String(targetMeta.parent_feature_id) : null;
                        if (parentFeatureId && currentDrag.ids.includes(parentFeatureId)) {
                            logDragDrop("execute:skip:would-create-cycle", { id, parentFeatureId, ids: currentDrag.ids });
                            return;
                        }
                        const nextMetadata = buildMovedFeatureMetadata(
                            feature,
                            nextFeaturesMap,
                            targetFeature.group_id,
                            parentFeatureId
                        );
                        events.push({
                            type: 'FeatureUpdated',
                            payload: {
                                id,
                                layer_id: targetFeature.layer_id,
                                group_id: targetFeature.group_id,
                                metadata: JSON.stringify(nextMetadata)
                            }
                        });
                        nextFeaturesMap[id] = {
                            ...feature,
                            layer_id: targetFeature.layer_id,
                            group_id: targetFeature.group_id,
                            metadata: nextMetadata
                        };
                    }
                }
            } else if (currentDrag.type === 'group' && group && id !== targetId) {
                const currentMeta = getParsedMetadata(group);
                const newOrder = timestamp + (index * 0.001);

                if (targetType === 'region') {
                    const region = rMap[targetId];
                    const targetLayerId = region?.layers?.[0]?.id || region?.layer_id;
                    logDragDrop("execute:group-to-region", { id, targetId, targetLayerId });
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
                    logDragDrop("execute:group-to-group", { id, targetId, targetLayerId: targetGroup?.layer_id });
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
            logDragDrop("execute:dispatch", { eventCount: events.length, events });
            dispatchEvents(events);
            clearSelection();
        } else {
            logDragDrop("execute:skip:no-events", { dragType: currentDrag.type, ids: currentDrag.ids, targetType, targetId });
        }
    }, [featuresRef, groupsRef, regionsRef, dispatchEvents, clearSelection]);

    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            const ctx = virtualDragRef.current;
            if (!ctx) return;

            if (!isVirtualDragging) {
                const dist = Math.sqrt(Math.pow(e.clientX - ctx.startX, 2) + Math.pow(e.clientY - ctx.startY, 2));
                if (dist > 5) {
                    logDragDrop("threshold:passed", { dragType: ctx.type, ids: ctx.ids, startX: ctx.startX, startY: ctx.startY, x: e.clientX, y: e.clientY, dist });
                    const resolved = getDragTargetInfo(e.clientX, e.clientY);
                    logDragDrop("target-resolve:threshold", {
                        elementsCount: resolved.elementsCount,
                        targetId: resolved.targetId,
                        targetType: resolved.targetType,
                        fallbackUsed: resolved.fallbackUsed,
                        draggingIds: draggingIdsRef.current
                    });
                    if (resolved.target && resolved.targetId && !draggingIdsRef.current.includes(resolved.targetId)) {
                        resolved.target.style.outline = "2px solid #10B981";
                        resolved.target.style.background = "rgba(16, 185, 129, 0.1)";
                        ctx.lastTarget = resolved.target;
                    }
                    setIsVirtualDragging(true);
                    document.body.style.cursor = "grabbing";
                    document.body.style.userSelect = "none";
                }
                return;
            }

            const resolved = getDragTargetInfo(e.clientX, e.clientY);
            const target = resolved.target;

            if (target && target !== ctx.lastTarget) {
                if (ctx.lastTarget) {
                    ctx.lastTarget.style.outline = "";
                    ctx.lastTarget.style.background = "";
                }
                logDragDrop("target-resolve:hover", {
                    elementsCount: resolved.elementsCount,
                    targetId: resolved.targetId,
                    targetType: resolved.targetType,
                    fallbackUsed: resolved.fallbackUsed,
                    draggingIds: draggingIdsRef.current
                });
                if (resolved.targetId && !draggingIdsRef.current.includes(resolved.targetId)) {
                    target.style.outline = "2px solid #10B981";
                    target.style.background = "rgba(16, 185, 129, 0.1)";
                    ctx.lastTarget = target;
                } else {
                    ctx.lastTarget = null;
                }
            } else if (!target && ctx.lastTarget) {
                logDragDrop("hover-target:clear", { x: e.clientX, y: e.clientY });
                ctx.lastTarget.style.outline = "";
                ctx.lastTarget.style.background = "";
                ctx.lastTarget = null;
            }
        };

        const handleGlobalMouseUp = (e: MouseEvent) => {
            const ctx = virtualDragRef.current;
            if (!ctx) return;

            if (isVirtualDragging) {
                const resolved = getDragTargetInfo(e.clientX, e.clientY, ctx.lastTarget);
                logDragDrop("drop:mouseup", {
                    x: e.clientX,
                    y: e.clientY,
                    hasTarget: Boolean(resolved.target),
                    targetId: resolved.targetId,
                    targetType: resolved.targetType
                });
                logDragDrop("target-resolve:mouseup", {
                    elementsCount: resolved.elementsCount,
                    targetId: resolved.targetId,
                    targetType: resolved.targetType,
                    fallbackUsed: resolved.fallbackUsed
                });
                if (resolved.target) {
                    if (resolved.targetId && resolved.targetType) {
                        handleExecuteMove(ctx, resolved.targetType, resolved.targetId);
                    } else {
                        logDragDrop("drop:skip:missing-target-attrs", { targetId: resolved.targetId, targetType: resolved.targetType });
                    }
                } else {
                    logDragDrop("drop:skip:no-target", { x: e.clientX, y: e.clientY });
                }
            } else {
                logDragDrop("drop:mouseup-before-dragging", { dragType: ctx.type, ids: ctx.ids, x: e.clientX, y: e.clientY });
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
        if (e.button !== 0) {
            logDragDrop("start:skip:non-left-button", { button: e.button, type, id });
            return;
        }
        const ids = selectionSet.has(id) ? Array.from(selectionSet) : [id];
        logDragDrop("start", { type, id, ids, selectedCount: selectionSet.size, x: e.clientX, y: e.clientY });
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
