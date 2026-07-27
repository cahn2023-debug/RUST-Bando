import { StateCreator } from 'zustand';
import { DesignActionSlice, DesignSyncStore } from './types';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../../../../tool/utils/logger';
import { invoke_design_event_batch } from '../../../../tool/utils/designIpc';
import { enrichEventBeforeDispatch } from '../../../../tool/utils/designEvents';
import { DesignEventType } from '@CONTRACT/designTypes';

let lastRecoveryInitializeAt = 0;
const RECOVERY_INITIALIZE_COOLDOWN_MS = 5000;
let consecutiveSyncFailures = 0;
let firstFailureAt = 0;
const SYNC_FAILURE_WINDOW_MS = 30000;
const MAX_SYNC_FAILURES_BEFORE_BREAKER = 3;
const IS_DEV = import.meta.env.DEV;

const shouldRecoverByInitialize = (): boolean => {
    const now = Date.now();
    if (!firstFailureAt || now - firstFailureAt > SYNC_FAILURE_WINDOW_MS) {
        firstFailureAt = now;
        consecutiveSyncFailures = 1;
    } else {
        consecutiveSyncFailures += 1;
    }
    return consecutiveSyncFailures < MAX_SYNC_FAILURES_BEFORE_BREAKER;
};

const markSyncRecovered = () => {
    consecutiveSyncFailures = 0;
    firstFailureAt = 0;
};

const tryRecoveryInitialize = (get: () => DesignSyncStore, projectId: string) => {
    const now = Date.now();
    const st = get();
    if (st.isLoading || st.isHydrating || st.error) {
        return;
    }
    if (now - lastRecoveryInitializeAt <= RECOVERY_INITIALIZE_COOLDOWN_MS) {
        return;
    }
    lastRecoveryInitializeAt = now;
    st.initialize(projectId, st.projectPath ?? undefined);
};

export const createDesignActionSlice: StateCreator<DesignSyncStore, [], [], DesignActionSlice> = (set, get) => ({
    dispatchEvent: async (incomingEvent) => {
        const { projectId, state, lastDispatchTime, isHydrating } = get();
        if (!projectId || !state || isHydrating) return;
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
            get().applyEventsOptimistically([incomingEvent]);
            set({ pendingSync: true, error: null });

            if (IS_DEV) {
                console.log(`[Sync] Dispatching ${event.type} to Rust (Incremental)...`, event.payload);
            }

            return invoke_design_event_batch(projectId, [event])
                .then((response) => {
                    markSyncRecovered();
                    if (response) {
                        get().applyPatchToState(response);
                    }
                    if (event.type === 'FeatureCreated' || (event.type === 'FeatureUpdated' && (event.payload as any).metadata)) {
                        get().syncDisplayOrderWithSTT();
                    }
                })
                .catch((e: any) => {
                    console.error("[Sync] Dispatch error, rolling back or re-hydrating:", e);
                    set({ state: previousState });
                    const now = Date.now();
                    if (shouldRecoverByInitialize() && now - lastRecoveryInitializeAt > RECOVERY_INITIALIZE_COOLDOWN_MS) {
                        tryRecoveryInitialize(get, projectId);
                    } else {
                        set({ error: "Sync đang lỗi liên tục. Đã tạm ngắt tự đồng bộ để tránh lặp. Vui lòng mở lại dự án." });
                    }
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
        const { projectId, state, isHydrating } = get();
        if (!projectId || !state || isHydrating || events.length === 0) return;

        const enrichedEvents = events.map(enrichEventBeforeDispatch);
        const previousState = state;

        try {
            get().applyEventsOptimistically(events);
            set({ pendingSync: true, error: null });

            return invoke_design_event_batch(projectId, enrichedEvents)
                .then((response) => {
                    markSyncRecovered();
                    if (response) {
                        get().applyPatchToState(response);
                    }
                })
                .catch((e: any) => {
                    console.error("[Sync] Batch dispatch error:", e);
                    set({ state: previousState });
                    const now = Date.now();
                    if (shouldRecoverByInitialize() && now - lastRecoveryInitializeAt > RECOVERY_INITIALIZE_COOLDOWN_MS) {
                        tryRecoveryInitialize(get, projectId);
                    } else {
                        set({ error: "Sync đang lỗi liên tục. Đã tạm ngắt tự đồng bộ để tránh lặp. Vui lòng mở lại dự án." });
                    }
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
        if (!queuedProjectId || events.length === 0) return;

        const preparedEvents = events.map(enrichEventBeforeDispatch);
        get().applyEventsOptimistically(events);
        set({ pendingSync: true });

        try {
            const response = await get()._internalBufferedSyncEvents(preparedEvents);
            const currentStore = get();

            if (
                response &&
                currentStore.projectId === queuedProjectId &&
                (currentStore.projectKey ?? `id:${queuedProjectId}`) === queuedProjectKey
            ) {
                currentStore.applyQueuedAckToState(response);
            }
        } catch (error) {
            console.error('[Sync] Direct sync failed for palette/settings:', error);
            throw error;
        } finally {
            set({ pendingSync: false });
        }
    },

    undo: async () => {
        const { projectId } = get();
        if (!projectId) return;
        try {
            const responseStr = await invoke<string>('undo_design_event', { projectId });
            const response = JSON.parse(responseStr);
            if (response.success) {
                tryRecoveryInitialize(get, projectId);
            }
        } catch (e) {
            logger.error(`[Sync] Undo failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    },

    redo: async () => {
        const { projectId } = get();
        if (!projectId) return;
        try {
            const responseStr = await invoke<string>('redo_design_event', { projectId });
            const response = JSON.parse(responseStr);
            if (response.success) {
                tryRecoveryInitialize(get, projectId);
            }
        } catch (e) {
            logger.error(`[Sync] Redo failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    },

    deduplicate: async () => {
        const { projectId } = get();
        if (!projectId) return;
        try {
            await invoke('deduplicate_features', { projectId });
            tryRecoveryInitialize(get, projectId);
        } catch (e) {
            logger.error(`[Sync] Deduplicate failed: ${e instanceof Error ? e.message : String(e)}`);
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
        const { calculateFeatureNumbers, getParsedMetadata, syncDisplayOrderAliases } = await import('../../../../tool/utils/featureUtils');

        const features = Object.values(state.features);
        const featureNumbers = calculateFeatureNumbers(features, state.features);
        const updateEvents: DesignEventType[] = [];

        features.forEach(f => {
            const calculatedSTT = featureNumbers[f.id];
            if (!calculatedSTT) return;
            const rawMetaStr = typeof f.metadata === 'string' ? f.metadata : '';
            const meta = getParsedMetadata(f);
            const nextMeta = syncDisplayOrderAliases(
                meta as Record<string, unknown>,
                String(calculatedSTT),
                f.properties as Record<string, unknown>
            );
            const currentOrder = typeof meta.display_order === 'string' || typeof meta.display_order === 'number'
                ? String(meta.display_order)
                : '';
            const currentAliasState = JSON.stringify(syncDisplayOrderAliases(
                meta as Record<string, unknown>,
                currentOrder,
                f.properties as Record<string, unknown>
            ));

            if (currentOrder !== String(calculatedSTT) || currentAliasState !== JSON.stringify(nextMeta)) {
                if (Object.keys(meta).length === 0 && rawMetaStr.length > 4 && rawMetaStr !== 'null' && rawMetaStr !== 'undefined') {
                    return;
                }
                updateEvents.push({
                    type: 'FeatureUpdated',
                    payload: {
                        id: f.id,
                        metadata: JSON.stringify(nextMeta)
                    }
                });
            }
        });

        if (updateEvents.length > 0) {
            await dispatchEvents(updateEvents);
        }
    }
});
