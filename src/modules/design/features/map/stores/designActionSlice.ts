import { StateCreator } from 'zustand';
import { DesignActionSlice, DesignSyncStore } from './types';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { logger } from '../../../../tool/utils/logger';
import {
    invoke_design_event_batch,
    savePalettePersist,
    WINDOW_SYNC_SOURCE_ID
} from '../../../../tool/utils/designIpc';
import { enrichEventBeforeDispatch } from '../../../../tool/utils/designEvents';
import { DesignEventType } from '@CONTRACT/designTypes';

export const createDesignActionSlice: StateCreator<DesignSyncStore, [], [], DesignActionSlice> = (set, get) => ({
    dispatchEvent: async (incomingEvent) => {
        const { projectId, state, lastDispatchTime } = get();
        if (!projectId || !state) return;
        const event = enrichEventBeforeDispatch(incomingEvent);

        if (event.type === 'FeatureUpdated') {
            const payload = event.payload as any;
            if (payload.id && payload.coordinates) {
                const now = Date.now();
                const last = lastDispatchTime[payload.id] || 0;
                if (now - last < 50) return;
                set(prev => ({ lastDispatchTime: { ...prev.lastDispatchTime, [payload.id]: now } }));
            }
        }

        const previousState = state;
        try {
            get().applyEventsOptimistically([event]);
            set({ pendingSync: true, error: null });

            console.log(`[Sync] 🚀 Dispatching ${event.type} to Rust (Incremental)...`, event.payload);

            return invoke_design_event_batch(projectId, [event])
                .then((response) => {
                    // V2 Fix: Apply topology side effects to RAM state immediately
                    // This ensures that when a Point moves, all snapped Polylines
                    // update their vertices in real-time (optimistic update)
                    if (response.side_effects && Array.isArray(response.side_effects)) {
                        for (const sideEffect of response.side_effects) {
                            get().applyPatchToState(sideEffect);
                        }
                    }
                    get().applyPatchToState(response);
                    void emit('sync-design-patch', { response, sourceId: WINDOW_SYNC_SOURCE_ID });
                    if (event.type === 'FeatureCreated' || (event.type === 'FeatureUpdated' && (event.payload as any).metadata)) {
                        get().syncDisplayOrderWithSTT();
                    }
                })
                .catch((e: any) => {
                    console.error("[Sync] Dispatch error, rolling back or re-hydrating:", e);
                    get().initialize(projectId, get().projectKey ?? undefined);
                    throw e;
                })
                .finally(() => {
                    set({ pendingSync: false });
                });
        } catch (e: any) {
            console.error("[Sync] internal dispatch error:", e);
            set({ state: previousState, pendingSync: false });
            throw e;
        }
    },

    dispatchEvents: async (events) => {
        const { projectId, state } = get();
        if (!projectId || !state || events.length === 0) return;

        const enrichedEvents = events.map(enrichEventBeforeDispatch);
        const previousState = state;

        try {
            get().applyEventsOptimistically(enrichedEvents);
            set({ pendingSync: true, error: null });

            return invoke_design_event_batch(projectId, enrichedEvents)
                .then((response) => {
                    // V2 Fix: Apply topology side effects for batch dispatch too
                    if (response.side_effects && Array.isArray(response.side_effects)) {
                        for (const sideEffect of response.side_effects) {
                            get().applyPatchToState(sideEffect);
                        }
                    }
                    get().applyPatchToState(response);
                    void emit('sync-design-patch', { response, sourceId: WINDOW_SYNC_SOURCE_ID });
                })
                .catch((e: any) => {
                    console.error("[Sync] Batch dispatch error:", e);
                    get().initialize(projectId, get().projectKey ?? undefined);
                    throw e;
                })
                .finally(() => {
                    set({ pendingSync: false });
                });
        } catch (e: any) {
            set({ state: previousState, pendingSync: false });
            throw e;
        }
    },

    queueEvent: async (event) => get().queueEvents([event]),

    queueEvents: async (events) => {
        const { projectId: queuedProjectId, projectKey: queuedProjectKey } = get();
        if (!queuedProjectId) return;

        const preparedEvents = events.map(enrichEventBeforeDispatch);
        get().applyEventsOptimistically(preparedEvents);
        set({ pendingSync: true });

        try {
            const response = await savePalettePersist(queuedProjectId, preparedEvents);
            const currentStore = get();

            if (
                currentStore.projectId === queuedProjectId &&
                (currentStore.projectKey ?? `id:${queuedProjectId}`) === queuedProjectKey
            ) {
                currentStore.applyQueuedAckToState(response);
            }
            void emit('sync-design-patch', { response, sourceId: WINDOW_SYNC_SOURCE_ID });
        } catch (error) {
            console.error('[Sync] Direct sync failed for palette/settings:', error);
            throw error;
        } finally {
            set({ pendingSync: false });
        }
    },

    flushPendingPersists: async () => {
        // Legacy method, no longer needed as there is no client-side queue
        set({ pendingSync: false });
    },

    undo: async () => {
        const { projectId } = get();
        if (!projectId) return;
        try {
            const responseStr = await invoke<string>('undo_design_event', { projectId });
            const response = JSON.parse(responseStr);
            if (response.success) {
                get().initialize(projectId, get().projectKey ?? undefined);
            }
        } catch (e) {
            logger.error(`[Sync] Undo failed: ${e}`);
        }
    },

    redo: async () => {
        const { projectId } = get();
        if (!projectId) return;
        try {
            const responseStr = await invoke<string>('redo_design_event', { projectId });
            const response = JSON.parse(responseStr);
            if (response.success) {
                get().initialize(projectId, get().projectKey ?? undefined);
            }
        } catch (e) {
            logger.error(`[Sync] Redo failed: ${e}`);
        }
    },

    deduplicate: async () => {
        const { projectId } = get();
        if (!projectId) return;
        try {
            await invoke('deduplicate_features', { projectId });
            get().initialize(projectId, get().projectKey ?? undefined);
        } catch (e) {
            logger.error(`[Sync] Deduplicate failed: ${e}`);
        }
    },

    deleteFeature: async (id) => {
        const { dispatchEvent, boxSelection, setBoxSelection } = get();
        await dispatchEvent({
            type: 'FeatureDeleted',
            payload: { id }
        });

        if (boxSelection) {
            const updatedItems = boxSelection.items.filter(item => item.id !== id);
            if (updatedItems.length === 0) {
                setBoxSelection(null);
            } else {
                setBoxSelection({
                    ...boxSelection,
                    count: updatedItems.length,
                    items: updatedItems,
                });
            }
        }
    },

    deleteSelectedFeatures: async () => {
        const { selectionSet, dispatchEvents, boxSelection, setBoxSelection } = get();
        if (selectionSet.size === 0) return;

        const idsToDelete = Array.from(selectionSet);
        const events: DesignEventType[] = idsToDelete.map(id => ({
            type: 'FeatureDeleted',
            payload: { id }
        }));

        await dispatchEvents(events);
        set({ selectionSet: new Set() });

        if (boxSelection) {
            const updatedItems = boxSelection.items.filter(item => !selectionSet.has(item.id));
            if (updatedItems.length === 0) {
                setBoxSelection(null);
            } else if (updatedItems.length !== boxSelection.items.length) {
                setBoxSelection({
                    ...boxSelection,
                    count: updatedItems.length,
                    items: updatedItems,
                });
            }
        }
    },

    syncDisplayOrderWithSTT: async () => {
        const { state, dispatchEvents } = get();
        if (!state || !state.features) return;

        // FeatureUtils calculateFeatureNumbers and getParsedMetadata are needed
        // I already moved them to @TOOL/utils/featureUtils
        const { calculateFeatureNumbers, getParsedMetadata } = await import('../../../../tool/utils/featureUtils');

        const features = Object.values(state.features);
        const featureNumbers = calculateFeatureNumbers(features, state.features);
        const updateEvents: DesignEventType[] = [];

        features.forEach(f => {
            const calculatedSTT = featureNumbers[f.id];
            if (!calculatedSTT) return;
            const rawMetaStr = f.metadata || "";
            const meta = getParsedMetadata(f);
            const currentOrder = String(meta.display_order || '');

            if (currentOrder !== String(calculatedSTT)) {
                if (Object.keys(meta).length === 0 && rawMetaStr.length > 4 && rawMetaStr !== 'null' && rawMetaStr !== 'undefined') {
                    return;
                }
                updateEvents.push({
                    type: 'FeatureUpdated',
                    payload: {
                        id: f.id,
                        metadata: JSON.stringify({ ...meta, display_order: String(calculatedSTT) })
                    }
                });
            }
        });

        if (updateEvents.length > 0) {
            await dispatchEvents(updateEvents);
        }
    }
});
