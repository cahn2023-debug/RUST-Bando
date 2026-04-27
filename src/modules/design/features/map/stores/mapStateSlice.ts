import { StateCreator } from 'zustand';
import { MapStateSlice, DesignSyncStore } from './types';
import { MapState } from '@CONTRACT/types';
import { DesignEventType } from '@CONTRACT/designTypes';


const UPDATE_THROTTLE_MS = 100;
let inboundUpdateTimer: any = null;
let inboundStateBuffer: MapState | null = null;
let lastUpdateTimestamp = 0;

export const createMapStateSlice: StateCreator<DesignSyncStore, [], [], MapStateSlice> = (set, get) => ({
    state: null,
    projectId: null,
    projectPath: null,
    projectKey: null,
    isLoading: false,
    isHydrating: false,
    error: null,
    lastSync: null,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    pendingSync: false,
    isMigrating: false,
    isSaving: false,
    lastDispatchTime: {},
    syncStatus: 0,

    // Giai đoạn 5: Optimistic UI state
    pendingSyncEvents: [],

    updateEntityMetadataOptimistic: async (entityType: string, entityId: string, metadata: any) => {
        const { state, projectKey, pendingSyncEvents } = get();
        if (!state || !projectKey) return;

        const tempId = crypto.randomUUID();
        let originalMetadata: any = {};

        // 1. Cập nhật UI ngay lập tức
        const optimisticState = { ...state };
        if (entityType === 'feature' && optimisticState.features[entityId]) {
            originalMetadata = { ...optimisticState.features[entityId].properties };
            optimisticState.features[entityId].properties = metadata;
        }

        // 2. Đẩy sự kiện vào pendingSyncEvents
        set({
            state: optimisticState,
            pendingSyncEvents: [...pendingSyncEvents, { id: tempId, payload: { entityType, entityId, metadata, original: originalMetadata } }]
        });

        // 3. Gọi IPC invoke
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('update_entity_metadata_v2', {
                request: {
                    project_id: projectKey, // projectKey is the string UUID
                    entity_id: entityId,
                    entity_type: entityType,
                    metadata: metadata,
                    device_id: 'frontend-optimistic-ui'
                }
            });

            // 4. Thành công: Xóa khỏi hàng đợi
            set((s) => ({
                pendingSyncEvents: s.pendingSyncEvents.filter(e => e.id !== tempId)
            }));
        } catch (error) {
            console.error("[Optimistic UI] Update failed, rolling back:", error);

            // 5. Thất bại: Rollback và xóa khỏi hàng đợi
            const currentStore = get();
            const failedEvent = currentStore.pendingSyncEvents.find(e => e.id === tempId);

            if (failedEvent) {
                const rollbackState = { ...currentStore.state! };
                if (entityType === 'feature' && rollbackState.features[entityId]) {
                    rollbackState.features[entityId].properties = failedEvent.payload.original;
                }

                set({
                    state: rollbackState,
                    pendingSyncEvents: currentStore.pendingSyncEvents.filter(e => e.id !== tempId)
                });
            }
        }
    },

    throttledSetState: (newState: MapState) => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            inboundStateBuffer = newState;
            return;
        }

        inboundStateBuffer = newState;
        const now = Date.now();
        const timeSinceLast = now - lastUpdateTimestamp;

        if (inboundUpdateTimer) return;

        if (timeSinceLast >= UPDATE_THROTTLE_MS) {
            lastUpdateTimestamp = now;
            set({ state: newState });
        } else {
            inboundUpdateTimer = setTimeout(() => {
                if (inboundStateBuffer) {
                    lastUpdateTimestamp = Date.now();
                    set({ state: inboundStateBuffer });
                    inboundStateBuffer = null;
                }
                inboundUpdateTimer = null;
            }, UPDATE_THROTTLE_MS - timeSinceLast);
        }
    },

    applyPatchToState: (response) => {
        const currentState = get().state;
        if (!currentState) return;

        const newState = { ...currentState };

        const applySingle = (event: DesignEventType) => {
            const { type, payload } = event as any;
            switch (type) {
                case 'FeatureCreated':
                case 'FeatureUpdated':
                    newState.features = {
                        ...newState.features,
                        [payload.id]: {
                            ...newState.features[payload.id],
                            ...payload
                        }
                    };
                    break;
                case 'FeatureDeleted': {
                    const { [payload.id]: _, ...remainingFeatures } = newState.features;
                    newState.features = remainingFeatures;
                    break;
                }
                case 'RegionCreated':
                case 'RegionUpdated':
                    newState.regions = {
                        ...newState.regions,
                        [payload.id]: {
                            ...newState.regions[payload.id],
                            ...payload
                        }
                    };
                    break;
                case 'RegionDeleted':
                    const { [payload.id]: __, ...remainingRegions } = newState.regions;
                    newState.regions = remainingRegions;
                    break;
                case 'LayerCreated':
                case 'LayerUpdated':
                    newState.layers = {
                        ...newState.layers,
                        [payload.id]: {
                            ...newState.layers[payload.id],
                            ...payload
                        }
                    };
                    break;
                case 'LayerDeleted':
                    const { [payload.id]: ___, ...remainingLayers } = newState.layers;
                    newState.layers = remainingLayers;
                    break;
                case 'FeatureGroupCreated':
                case 'FeatureGroupUpdated':
                    newState.feature_groups = {
                        ...newState.feature_groups,
                        [payload.id]: {
                            ...newState.feature_groups[payload.id],
                            ...payload
                        }
                    };
                    break;
                case 'FeatureGroupDeleted':
                    const { [payload.id]: ____, ...remainingGroups } = newState.feature_groups;
                    newState.feature_groups = remainingGroups;
                    break;
                case 'update_metadata':
                case 'preview_update':
                    newState.features = {
                        ...newState.features,
                        [payload.featureId]: {
                            ...newState.features[payload.featureId],
                            metadata: typeof payload.metadata === 'string'
                                ? payload.metadata
                                : JSON.stringify(payload.metadata)
                        }
                    };
                    break;
                case 'SettingsUpdated':
                    newState.settings = payload.settings;
                    break;
            }
        };

        if ('applied_event' in response) {
            newState.lastEventId = response.event_id;
            applySingle(response.applied_event);
            response.side_effects.forEach(applySingle);
        } else {
            newState.lastEventId = response.last_event_id;
            response.applied_events.forEach(applySingle);
            response.side_effects.forEach(applySingle);
        }

        set({ state: newState });
        console.log(`[Sync] ✅ Patch applied for ${newState.lastEventId}`);
    },

    applyQueuedAckToState: (response) => {
        const currentState = get().state;
        if (!currentState) return;

        const newState = { ...currentState };

        const applySingle = (event: DesignEventType) => {
            const { type, payload } = event as any;
            switch (type) {
                case 'FeatureCreated':
                case 'FeatureUpdated':
                    newState.features = {
                        ...newState.features,
                        [payload.id]: {
                            ...newState.features[payload.id],
                            ...payload
                        }
                    };
                    break;
                case 'FeatureDeleted': {
                    const { [payload.id]: _, ...remainingFeatures } = newState.features;
                    newState.features = remainingFeatures;
                    break;
                }
                case 'RegionCreated':
                case 'RegionUpdated':
                    newState.regions = {
                        ...newState.regions,
                        [payload.id]: {
                            ...newState.regions[payload.id],
                            ...payload
                        }
                    };
                    break;
                case 'RegionDeleted':
                    const { [payload.id]: __, ...remainingRegions } = newState.regions;
                    newState.regions = remainingRegions;
                    break;
                case 'LayerCreated':
                case 'LayerUpdated':
                    newState.layers = {
                        ...newState.layers,
                        [payload.id]: {
                            ...newState.layers[payload.id],
                            ...payload
                        }
                    };
                    break;
                case 'LayerDeleted':
                    const { [payload.id]: ___, ...remainingLayers } = newState.layers;
                    newState.layers = remainingLayers;
                    break;
                case 'FeatureGroupCreated':
                case 'FeatureGroupUpdated':
                    newState.feature_groups = {
                        ...newState.feature_groups,
                        [payload.id]: {
                            ...newState.feature_groups[payload.id],
                            ...payload
                        }
                    };
                    break;
                case 'FeatureGroupDeleted':
                    const { [payload.id]: ____, ...remainingGroups } = newState.feature_groups;
                    newState.feature_groups = remainingGroups;
                    break;
                case 'SettingsUpdated':
                    newState.settings = payload.settings;
                    break;
            }
        };

        if ('applied_event' in response) {
            newState.lastEventId = response.event_id;
            response.side_effects.forEach(applySingle);
        } else {
            newState.lastEventId = response.last_event_id;
            response.side_effects.forEach(applySingle);
        }

        set({ state: newState });
        console.log(`[Sync] Queued ack applied for ${newState.lastEventId}`);
    },

    applyEventsOptimistically: (events) => {
        const currentState = get().state;
        if (!currentState) return;

        const newState = { ...currentState };

        const apply = (ev: DesignEventType) => {
            const { type, payload } = ev as any;
            switch (type) {
                case 'FeatureCreated':
                case 'FeatureUpdated':
                    const fPayload = { ...payload };
                    if (fPayload.group_id === '') fPayload.group_id = null;
                    newState.features = { ...newState.features, [payload.id]: { ...newState.features[payload.id], ...fPayload } };
                    break;
                case 'FeatureDeleted':
                    const { [payload.id]: _, ...remainingFeatures } = newState.features;
                    newState.features = remainingFeatures;
                    break;
                case 'RegionCreated':
                case 'RegionUpdated':
                    newState.regions = { ...newState.regions, [payload.id]: { ...newState.regions[payload.id], ...payload } };
                    break;
                case 'RegionDeleted':
                    const { [payload.id]: __, ...remainingRegions } = newState.regions;
                    newState.regions = remainingRegions;
                    break;
                case 'LayerCreated':
                case 'LayerUpdated':
                    newState.layers = { ...newState.layers, [payload.id]: { ...newState.layers[payload.id], ...payload } };
                    break;
                case 'LayerDeleted':
                    const { [payload.id]: ___, ...remainingLayers } = newState.layers;
                    newState.layers = remainingLayers;
                    break;
                case 'FeatureGroupCreated':
                case 'FeatureGroupUpdated':
                    const gPayload = { ...payload };
                    if (gPayload.parent_id === '') gPayload.parent_id = null;
                    newState.feature_groups = { ...newState.feature_groups, [payload.id]: { ...newState.feature_groups[payload.id], ...gPayload } };
                    break;
                case 'FeatureGroupDeleted':
                    const { [payload.id]: ____, ...remainingGroups } = newState.feature_groups;
                    newState.feature_groups = remainingGroups;
                    break;
                case 'update_metadata':
                case 'preview_update':
                    newState.features = {
                        ...newState.features,
                        [payload.featureId]: {
                            ...newState.features[payload.featureId],
                            metadata: typeof payload.metadata === 'string'
                                ? payload.metadata
                                : JSON.stringify(payload.metadata)
                        }
                    };
                    break;
                case 'SettingsUpdated':
                    newState.settings = payload.settings;
                    break;
            }
        };

        events.forEach(apply);
        set({ state: newState });
        console.log(`[Sync] 🚀 Optimistic update applied for ${events.length} events`);
    },

    updateSettings: async (settings) => {
        const event: DesignEventType = {
            type: 'SettingsUpdated',
            payload: { settings },
        };
        try {
            await get().queueEvent(event);
        } catch (error) {
            console.error('Failed to update settings:', error);
            throw error;
        }
    },

    setIsSaving: (isSaving) => set({ isSaving })
});
