import { StateCreator } from 'zustand';
import { MapStateSlice, DesignSyncStore } from './types';
import { MapState } from '@CONTRACT/types';
import { DesignEventType } from '@CONTRACT/designTypes';
import { normalizeMapStateForDisplay } from '../../../../tool/utils/normalizeDisplay';



const UPDATE_THROTTLE_MS = 100;
const IS_DEV = import.meta.env.DEV;
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
                    const currentFeature = newState.features[payload.id];
                    if (IS_DEV && type === 'FeatureUpdated') {
                        console.groupCollapsed(`[Sync] applyPatchToState FeatureUpdated ${payload.id}`);
                        console.log('incoming payload:', payload);
                        console.log('before metadata:', currentFeature?.metadata);
                        console.log('before properties:', currentFeature?.properties);
                        console.groupEnd();
                    }
                    newState.features = {
                        ...newState.features,
                        [payload.id]: currentFeature ? {
                            ...currentFeature,
                            ...Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== null && v !== undefined))
                        } : { ...payload }
                    };
                    break;
                case 'FeatureDeleted': {
                    const { [payload.id]: _, ...remainingFeatures } = newState.features;
                    newState.features = remainingFeatures;
                    break;
                }
                case 'RegionCreated':
                case 'RegionUpdated':
                    if (!newState.regions) newState.regions = {};
                    newState.regions = {
                        ...newState.regions,
                        [payload.id]: {
                            ...(newState.regions[payload.id] || {}),
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
                    if (!newState.layers) newState.layers = {};
                    newState.layers = {
                        ...newState.layers,
                        [payload.id]: {
                            ...(newState.layers[payload.id] || {}),
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
                    if (!newState.feature_groups) newState.feature_groups = {};
                    newState.feature_groups = {
                        ...newState.feature_groups,
                        [payload.id]: {
                            ...(newState.feature_groups[payload.id] || {}),
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
            response.side_effects?.forEach(applySingle);
        } else {
            newState.lastEventId = response.last_event_id;
            response.applied_events?.forEach(applySingle);
            response.side_effects?.forEach(applySingle);
        }

        const normalizedState = normalizeMapStateForDisplay(newState);
        set({ state: normalizedState });
        if (IS_DEV) {
            console.log(`[Sync] Patch applied for ${normalizedState.lastEventId}`);
        }
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
                    if (IS_DEV && type === 'FeatureUpdated') {
                        console.groupCollapsed(`[Sync] applyQueuedAckToState FeatureUpdated ${payload.id}`);
                        console.log('incoming payload:', payload);
                        console.log('before metadata:', newState.features[payload.id]?.metadata);
                        console.log('before properties:', newState.features[payload.id]?.properties);
                        console.groupEnd();
                    }
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
                    if (!newState.regions) newState.regions = {};
                    newState.regions = {
                        ...newState.regions,
                        [payload.id]: {
                            ...(newState.regions[payload.id] || {}),
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
                    if (!newState.layers) newState.layers = {};
                    newState.layers = {
                        ...newState.layers,
                        [payload.id]: {
                            ...(newState.layers[payload.id] || {}),
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
                    if (!newState.feature_groups) newState.feature_groups = {};
                    newState.feature_groups = {
                        ...newState.feature_groups,
                        [payload.id]: {
                            ...(newState.feature_groups[payload.id] || {}),
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
            applySingle(response.applied_event);
            response.side_effects?.forEach(applySingle);
        } else {
            newState.lastEventId = response.last_event_id;
            response.applied_events?.forEach(applySingle);
            response.side_effects?.forEach(applySingle);
        }

        const normalizedState = normalizeMapStateForDisplay(newState);
        set({ state: normalizedState });
        if (IS_DEV) {
            console.log(`[Sync] Queued ack applied for ${normalizedState.lastEventId}`);
        }
    },

    applyEventsOptimistically: (events) => {
        const currentState = get().state;
        if (!currentState) return;

        const newState = { ...currentState };

        const apply = (ev: DesignEventType) => {
            const { type, payload } = ev as any;
            if (!payload) return;

            switch (type) {
                case 'FeatureCreated':
                case 'FeatureUpdated':
                    if (!newState.features) newState.features = {};
                    const fPayload = { ...payload };
                    if (fPayload.group_id === '') fPayload.group_id = null;
                    const currentFeature = newState.features[payload.id];
                    if (IS_DEV && type === 'FeatureUpdated') {
                        console.groupCollapsed(`[Sync] applyEventsOptimistically FeatureUpdated ${payload.id}`);
                        console.log('incoming payload:', fPayload);
                        console.log('before metadata:', currentFeature?.metadata);
                        console.log('before properties:', currentFeature?.properties);
                        console.groupEnd();
                    }
                    newState.features = {
                        ...newState.features,
                        [payload.id]: currentFeature ? {
                            ...currentFeature,
                            ...Object.fromEntries(Object.entries(fPayload).filter(([_, v]) => v !== null && v !== undefined))
                        } : { ...fPayload }
                    };
                    break;
                case 'FeatureDeleted':
                    if (!newState.features) break;
                    const { [payload.id]: _, ...remainingFeatures } = newState.features;
                    newState.features = remainingFeatures;
                    break;
                case 'RegionCreated':
                case 'RegionUpdated':
                    if (!newState.regions) newState.regions = {};
                    newState.regions = { 
                        ...newState.regions, 
                        [payload.id]: { ...(newState.regions[payload.id] || {}), ...payload } 
                    };
                    break;
                case 'RegionDeleted':
                    if (!newState.regions) break;
                    const { [payload.id]: __, ...remainingRegions } = newState.regions;
                    newState.regions = remainingRegions;
                    break;
                case 'LayerCreated':
                case 'LayerUpdated':
                    if (!newState.layers) newState.layers = {};
                    newState.layers = { 
                        ...newState.layers, 
                        [payload.id]: { ...(newState.layers[payload.id] || {}), ...payload } 
                    };
                    break;
                case 'LayerDeleted':
                    if (!newState.layers) break;
                    const { [payload.id]: ___, ...remainingLayers } = newState.layers;
                    newState.layers = remainingLayers;
                    break;
                case 'FeatureGroupCreated':
                case 'FeatureGroupUpdated':
                    if (!newState.feature_groups) newState.feature_groups = {};
                    const gPayload = { ...payload };
                    if (gPayload.parent_id === '') gPayload.parent_id = null;
                    newState.feature_groups = { 
                        ...newState.feature_groups, 
                        [payload.id]: { ...(newState.feature_groups[payload.id] || {}), ...gPayload } 
                    };
                    break;
                case 'FeatureGroupDeleted':
                    if (!newState.feature_groups) break;
                    const { [payload.id]: ____, ...remainingGroups } = newState.feature_groups;
                    newState.feature_groups = remainingGroups;
                    break;
                case 'update_metadata':
                case 'preview_update':
                    if (!newState.features) break;
                    if (!newState.features[payload.featureId]) break;
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

        events?.forEach(apply);
        const normalizedState = normalizeMapStateForDisplay(newState);
        set({ state: normalizedState });
        if (IS_DEV) {
            console.log(`[Sync] Optimistic update applied for ${events?.length || 0} events`);
        }
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
