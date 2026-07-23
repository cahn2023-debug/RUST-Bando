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

const parseJsonObject = (value: unknown): Record<string, unknown> | null => {
    if (!value) return null;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
};

const isEmptyMetadataShell = (value: unknown) => {
    const metadata = parseJsonObject(value);
    if (!metadata) return false;
    const entries = Object.entries(metadata);
    if (entries.length === 0) return true;
    return entries.every(([key, entryValue]) => (
        ['media', 'gis', 'business', 'specs'].includes(key) &&
        entryValue &&
        typeof entryValue === 'object' &&
        !Array.isArray(entryValue) &&
        Object.keys(entryValue).length === 0
    ));
};

const isDefaultPointProperties = (value: unknown) => {
    const properties = parseJsonObject(value);
    if (!properties) return false;
    const keys = Object.keys(properties);
    return keys.length > 0 &&
        keys.every(key => ['icon', 'iconKey', 'type'].includes(key)) &&
        (properties.type === 'point' || properties.type === 'Point' || properties.type === 'POINT') &&
        (!('icon' in properties) || properties.icon === 'default') &&
        (!('iconKey' in properties) || properties.iconKey === 'default');
};

const PRESERVED_METADATA_KEYS = [
    'parent_feature_id',
    'source_parent_feature_id',
    'snap_links',
    'network',
    'start_node_id',
    'end_node_id',
    'infrastructure',
] as const;

const serializeMetadataLikePayload = (originalPayload: unknown, metadata: Record<string, unknown>) => (
    typeof originalPayload === 'string' ? JSON.stringify(metadata) : metadata
);

const buildSafeFeaturePatch = (currentFeature: MapState['features'][string] | undefined, payload: any) => {
    const patch: Record<string, unknown> = Object.fromEntries(
        Object.entries(payload).filter(([key, value]) => (
            value !== undefined && (value !== null || key === 'group_id')
        ))
    );

    if (patch.group_id === '') patch.group_id = null;

    if (!currentFeature) return patch;

    if (
        'metadata' in patch &&
        isEmptyMetadataShell(patch.metadata) &&
        !isEmptyMetadataShell(currentFeature.metadata)
    ) {
        delete patch.metadata;
    }

    if (
        'properties' in patch &&
        isDefaultPointProperties(patch.properties) &&
        !isDefaultPointProperties(currentFeature.properties)
    ) {
        delete patch.properties;
    }

    if ('metadata' in patch && patch.metadata !== undefined && patch.metadata !== null) {
        const currentMetadata = parseJsonObject(currentFeature.metadata);
        const patchMetadata = parseJsonObject(patch.metadata);
        if (currentMetadata && patchMetadata) {
            let didPreserve = false;
            const mergedMetadata: Record<string, unknown> = { ...currentMetadata, ...patchMetadata };

            ['media', 'gis', 'specs', 'business', 'infrastructure', 'network'].forEach((sectionKey) => {
                const currentSec = parseJsonObject(currentMetadata[sectionKey]);
                const patchSec = parseJsonObject(patchMetadata[sectionKey]);
                if (currentSec && patchSec) {
                    mergedMetadata[sectionKey] = { ...currentSec, ...patchSec };
                    didPreserve = true;
                } else if (currentSec && !patchMetadata[sectionKey]) {
                    mergedMetadata[sectionKey] = currentSec;
                    didPreserve = true;
                }
            });

            PRESERVED_METADATA_KEYS.forEach((key) => {
                if (
                    currentMetadata[key] !== undefined &&
                    currentMetadata[key] !== null &&
                    mergedMetadata[key] === undefined
                ) {
                    mergedMetadata[key] = currentMetadata[key];
                    didPreserve = true;
                }
            });

            if (didPreserve || Object.keys(mergedMetadata).length > Object.keys(patchMetadata).length) {
                patch.metadata = serializeMetadataLikePayload(patch.metadata, mergedMetadata);
            }
        }
    }

    if ('geom_type' in patch) {
        delete patch.geom_type;
    }

    return patch;
};

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
            set({ state: normalizeMapStateForDisplay(newState) });
        } else {
            inboundUpdateTimer = setTimeout(() => {
                if (inboundStateBuffer) {
                    lastUpdateTimestamp = Date.now();
                    set({ state: normalizeMapStateForDisplay(inboundStateBuffer) });
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
                case 'FeatureUpdated': {
                    const currentFeature = newState.features[payload.id];
                    if (IS_DEV && type === 'FeatureUpdated') {
                        console.groupCollapsed(`[Sync] applyPatchToState FeatureUpdated ${payload.id}`);
                        console.log('incoming payload:', payload);
                        console.log('before metadata:', currentFeature?.metadata);
                        console.log('before properties:', currentFeature?.properties);
                        console.groupEnd();
                    }
                    const safePatch = buildSafeFeaturePatch(currentFeature, payload);
                    newState.features = {
                        ...newState.features,
                        [payload.id]: currentFeature ? {
                            ...currentFeature,
                            ...safePatch
                        } : { ...safePatch }
                    };
                    break;
                }
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
                case 'RegionDeleted': {
                    const { [payload.id]: __, ...remainingRegions } = newState.regions;
                    newState.regions = remainingRegions;
                    break;
                }
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
                case 'LayerDeleted': {
                    const { [payload.id]: ___, ...remainingLayers } = newState.layers;
                    newState.layers = remainingLayers;
                    break;
                }
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
                case 'FeatureGroupDeleted': {
                    const { [payload.id]: ____, ...remainingGroups } = newState.feature_groups;
                    newState.feature_groups = remainingGroups;
                    break;
                }
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
                case 'FeatureUpdated': {
                    if (IS_DEV && type === 'FeatureUpdated') {
                        console.groupCollapsed(`[Sync] applyQueuedAckToState FeatureUpdated ${payload.id}`);
                        console.log('incoming payload:', payload);
                        console.log('before metadata:', newState.features[payload.id]?.metadata);
                        console.log('before properties:', newState.features[payload.id]?.properties);
                        console.groupEnd();
                    }
                    const currentFeature = newState.features[payload.id];
                    const safePatch = buildSafeFeaturePatch(currentFeature, payload);
                    newState.features = {
                        ...newState.features,
                        [payload.id]: currentFeature ? {
                            ...currentFeature,
                            ...safePatch
                        } : { ...safePatch }
                    };
                    break;
                }
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
                case 'RegionDeleted': {
                    const { [payload.id]: __, ...remainingRegions } = newState.regions;
                    newState.regions = remainingRegions;
                    break;
                }
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
                case 'LayerDeleted': {
                    const { [payload.id]: ___, ...remainingLayers } = newState.layers;
                    newState.layers = remainingLayers;
                    break;
                }
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
                case 'FeatureGroupDeleted': {
                    const { [payload.id]: ____, ...remainingGroups } = newState.feature_groups;
                    newState.feature_groups = remainingGroups;
                    break;
                }
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
                case 'FeatureUpdated': {
                    if (!newState.features) newState.features = {};
                    const fPayload = buildSafeFeaturePatch(newState.features[payload.id], payload);
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
                            ...fPayload
                        } : { ...fPayload }
                    };
                    break;
                }
                case 'FeatureDeleted': {
                    if (!newState.features) break;
                    const { [payload.id]: _, ...remainingFeatures } = newState.features;
                    newState.features = remainingFeatures;
                    break;
                }
                case 'RegionCreated':
                case 'RegionUpdated':
                    if (!newState.regions) newState.regions = {};
                    newState.regions = { 
                        ...newState.regions, 
                        [payload.id]: { ...(newState.regions[payload.id] || {}), ...payload } 
                    };
                    break;
                case 'RegionDeleted': {
                    if (!newState.regions) break;
                    const { [payload.id]: __, ...remainingRegions } = newState.regions;
                    newState.regions = remainingRegions;
                    break;
                }
                case 'LayerCreated':
                case 'LayerUpdated':
                    if (!newState.layers) newState.layers = {};
                    newState.layers = { 
                        ...newState.layers, 
                        [payload.id]: { ...(newState.layers[payload.id] || {}), ...payload } 
                    };
                    break;
                case 'LayerDeleted': {
                    if (!newState.layers) break;
                    const { [payload.id]: ___, ...remainingLayers } = newState.layers;
                    newState.layers = remainingLayers;
                    break;
                }
                case 'FeatureGroupCreated':
                case 'FeatureGroupUpdated': {
                    if (!newState.feature_groups) newState.feature_groups = {};
                    const gPayload = { ...payload };
                    if (gPayload.parent_id === '') gPayload.parent_id = null;
                    newState.feature_groups = { 
                        ...newState.feature_groups, 
                        [payload.id]: { ...(newState.feature_groups[payload.id] || {}), ...gPayload } 
                    };
                    break;
                }
                case 'FeatureGroupDeleted': {
                    if (!newState.feature_groups) break;
                    const { [payload.id]: ____, ...remainingGroups } = newState.feature_groups;
                    newState.feature_groups = remainingGroups;
                    break;
                }
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
