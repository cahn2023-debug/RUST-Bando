import { StateCreator } from 'zustand';
import { normalizeFeatureForDisplay } from '../../../../tool/utils/normalizeDisplay';
import { MapStateSlice, DesignSyncStore } from './types';
import { MapState } from '@CONTRACT/types';
import { DesignEventType } from '@CONTRACT/designTypes';
import { normalizeMapStateForDisplay } from '../../../../tool/utils/normalizeDisplay';
import { createMapCameraSubSlice } from './mapCameraSubSlice';
import { applyLayerEventToMapState, removeFeaturesFromRecord } from './mapLayersSubSlice';



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

const cleanupDeletedFeatures = (
    state: DesignSyncStore,
    deletedIds: Set<string>,
    nextState: MapState
): Partial<DesignSyncStore> => {
    if (deletedIds.size === 0) return {};

    const selectionSet = new Set(state.selectionSet);
    deletedIds.forEach(id => selectionSet.delete(id));

    const boxSelection = state.boxSelection
        ? {
            ...state.boxSelection,
            items: state.boxSelection.items.filter(item => !deletedIds.has(item.id))
        }
        : null;
    const nextBoxSelection = boxSelection && boxSelection.items.length > 0
        ? { ...boxSelection, count: boxSelection.items.length }
        : null;
    const selectedWasDeleted = !!state.selectedFeatureId && deletedIds.has(state.selectedFeatureId);

    return {
        visibleFeatures: removeFeaturesFromRecord(state.visibleFeatures, deletedIds),
        visibleFeatureIds: state.visibleFeatureIds.filter(id => !deletedIds.has(id)),
        featureDetailsCache: removeFeaturesFromRecord(state.featureDetailsCache, deletedIds),
        viewportRevision: state.viewportRevision + 1,
        selectedFeatureId: selectedWasDeleted ? null : state.selectedFeatureId,
        selectedGroupId: state.selectedGroupId && !nextState.feature_groups?.[state.selectedGroupId] ? null : state.selectedGroupId,
        selectedPopupLocation: selectedWasDeleted ? null : state.selectedPopupLocation,
        hoverId: state.hoverId && deletedIds.has(state.hoverId) ? null : state.hoverId,
        editingFeatureId: state.editingFeatureId && deletedIds.has(state.editingFeatureId) ? null : state.editingFeatureId,
        previewMetadata: state.previewMetadata?.id && deletedIds.has(state.previewMetadata.id) ? null : state.previewMetadata,
        selectionSet,
        boxSelection: nextBoxSelection,
    };
};

const syncUpdatedFeatureCaches = (
    state: DesignSyncStore,
    updatedIds: Set<string>,
    nextState: MapState
): Partial<DesignSyncStore> => {
    if (updatedIds.size === 0) return {};

    let visibleFeatures = state.visibleFeatures;
    let featureDetailsCache = state.featureDetailsCache;
    let visibleChanged = false;
    let cacheChanged = false;

    updatedIds.forEach(id => {
        const feature = nextState.features?.[id];
        if (!feature) return;

        if (visibleFeatures[id]) {
            if (!visibleChanged) visibleFeatures = { ...visibleFeatures };
            visibleFeatures[id] = feature;
            visibleChanged = true;
        }

        if (!cacheChanged) featureDetailsCache = { ...featureDetailsCache };
        featureDetailsCache[id] = feature;
        cacheChanged = true;
    });

    return {
        ...(visibleChanged ? { visibleFeatures } : {}),
        ...(cacheChanged ? { featureDetailsCache } : {}),
    };
};

const resolveFeatureById = (
    state: DesignSyncStore,
    nextState: MapState,
    id: string
): MapState['features'][string] | undefined => (
    nextState.features?.[id] ||
    state.featureDetailsCache[id] ||
    state.visibleFeatures[id]
);

const hasRenderableCoordinates = (payload: any) => {
    const coordinates = payload?.coordinates ?? payload?.geometry;
    return Array.isArray(coordinates) && coordinates.length > 0;
};

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
    ...createMapCameraSubSlice(set),

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
        const storeState = get();
        const currentState = storeState.state;
        if (!currentState) return;

        const newState = { ...currentState };
        const deletedFeatureIds = new Set<string>();
        const updatedFeatureIds = new Set<string>();
        let shouldRefreshViewport = false;
        // Track new feature payloads that should be injected into visibleFeatures immediately
        // on large project (viewport-first mode) without waiting for the async queryVisibleFeaturesV2 IPC call.
        const newLargeProjectFeatures = new Map<string, any>();

        const applySingle = (event: DesignEventType) => {
            const { type, payload } = event as any;
            switch (type) {
                case 'FeatureCreated':
                case 'FeatureUpdated': {
                    if (type === 'FeatureCreated' && hasRenderableCoordinates(payload)) {
                        shouldRefreshViewport = true;
                        // On large project, directly inject new features into visibleFeatures
                        // so they appear immediately without waiting for the async queryVisibleFeaturesV2 path.
                        // Guard: only inject non-default features (default point placeholders are excluded).
                        if (currentState.isLargeProject && !isDefaultPointProperties(payload.properties)) {
                            newLargeProjectFeatures.set(payload.id, payload);
                        }
                    }
                    if (type === 'FeatureUpdated' && currentState.isLargeProject) {
                        // FeatureUpdated on large project: trigger viewport refresh so queryVisibleFeaturesV2
                        // is called again. Also, syncUpdatedFeatureCaches (below) will update the feature
                        // in visibleFeatures if it is already present there.
                        shouldRefreshViewport = true;
                    }
                    const currentFeature = resolveFeatureById(storeState, newState, payload.id);
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
                    updatedFeatureIds.add(payload.id);
                    break;
                }
                case 'FeatureDeleted': {
                    const { [payload.id]: _, ...remainingFeatures } = newState.features;
                    newState.features = remainingFeatures;
                    deletedFeatureIds.add(payload.id);
                    break;
                }
                case 'RegionCreated':
                case 'RegionUpdated':
                    applyLayerEventToMapState(newState, type, payload);
                    break;
                case 'RegionDeleted': {
                    const result = applyLayerEventToMapState(newState, type, payload);
                    result?.deletedFeatureIds.forEach(id => deletedFeatureIds.add(id));
                    break;
                }
                case 'LayerCreated':
                case 'LayerUpdated':
                    applyLayerEventToMapState(newState, type, payload);
                    break;
                case 'LayerDeleted': {
                    const result = applyLayerEventToMapState(newState, type, payload);
                    result?.deletedFeatureIds.forEach(id => deletedFeatureIds.add(id));
                    break;
                }
                case 'FeatureGroupCreated':
                case 'FeatureGroupUpdated':
                    applyLayerEventToMapState(newState, type, payload);
                    break;
                case 'FeatureGroupDeleted': {
                    const result = applyLayerEventToMapState(newState, type, payload);
                    result?.deletedFeatureIds.forEach(id => deletedFeatureIds.add(id));
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
        set((s) => {
            const cacheUpdates = syncUpdatedFeatureCaches(s, updatedFeatureIds, normalizedState);
            const deleteUpdates = cleanupDeletedFeatures(s, deletedFeatureIds, normalizedState);

            // On large project, inject newly created non-default features directly into visibleFeatures
            // so they appear immediately without waiting for the async queryVisibleFeaturesV2 IPC path.
            let injectUpdates: Partial<typeof s> = {};
            if (newLargeProjectFeatures.size > 0) {
                const nextVisibleFeatures = { ...(cacheUpdates.visibleFeatures ?? s.visibleFeatures) };
                let nextVisibleFeatureIds = [...(s.visibleFeatureIds)];
                const featureDetailsCache = { ...(cacheUpdates.featureDetailsCache ?? s.featureDetailsCache) };
                newLargeProjectFeatures.forEach((_payload, id) => {
                    const normalizedFeature = normalizedState.features?.[id];
                    if (normalizedFeature) {
                        const featureWithGroup = normalizeFeatureForDisplay(
                            normalizedFeature,
                            undefined,
                            normalizedState.feature_groups?.[normalizedFeature.group_id as string]
                        );
                        nextVisibleFeatures[id] = featureWithGroup;
                        if (!nextVisibleFeatureIds.includes(id)) {
                            nextVisibleFeatureIds = [...nextVisibleFeatureIds, id];
                        }
                        featureDetailsCache[id] = featureWithGroup;
                    }
                });
                injectUpdates = {
                    visibleFeatures: nextVisibleFeatures,
                    visibleFeatureIds: nextVisibleFeatureIds,
                    featureDetailsCache,
                };
            }

            return {
                state: normalizedState,
                ...(shouldRefreshViewport ? { viewportRevision: s.viewportRevision + 1 } : {}),
                ...cacheUpdates,
                ...deleteUpdates,
                ...injectUpdates,
            };
        });
        if (IS_DEV) {
            console.log(`[Sync] Patch applied for ${normalizedState.lastEventId}`);
        }
    },

    applyQueuedAckToState: (response) => {
        const storeState = get();
        const currentState = storeState.state;
        if (!currentState) return;

        const newState = { ...currentState };
        const deletedFeatureIds = new Set<string>();
        const updatedFeatureIds = new Set<string>();
        let shouldRefreshViewport = false;

        const applySingle = (event: DesignEventType) => {
            const { type, payload } = event as any;
            switch (type) {
                case 'FeatureCreated':
                case 'FeatureUpdated': {
                    if (type === 'FeatureCreated' && hasRenderableCoordinates(payload)) {
                        shouldRefreshViewport = true;
                    }
                    if (IS_DEV && type === 'FeatureUpdated') {
                        const currentFeature = resolveFeatureById(storeState, newState, payload.id);
                        console.groupCollapsed(`[Sync] applyQueuedAckToState FeatureUpdated ${payload.id}`);
                        console.log('incoming payload:', payload);
                        console.log('before metadata:', currentFeature?.metadata);
                        console.log('before properties:', currentFeature?.properties);
                        console.groupEnd();
                    }
                    const currentFeature = resolveFeatureById(storeState, newState, payload.id);
                    const safePatch = buildSafeFeaturePatch(currentFeature, payload);
                    newState.features = {
                        ...newState.features,
                        [payload.id]: currentFeature ? {
                            ...currentFeature,
                            ...safePatch
                        } : { ...safePatch }
                    };
                    updatedFeatureIds.add(payload.id);
                    break;
                }
                case 'FeatureDeleted': {
                    const { [payload.id]: _, ...remainingFeatures } = newState.features;
                    newState.features = remainingFeatures;
                    deletedFeatureIds.add(payload.id);
                    break;
                }
                case 'RegionCreated':
                case 'RegionUpdated':
                    applyLayerEventToMapState(newState, type, payload);
                    break;
                case 'RegionDeleted': {
                    const result = applyLayerEventToMapState(newState, type, payload);
                    result?.deletedFeatureIds.forEach(id => deletedFeatureIds.add(id));
                    break;
                }
                case 'LayerCreated':
                case 'LayerUpdated':
                    applyLayerEventToMapState(newState, type, payload);
                    break;
                case 'LayerDeleted': {
                    const result = applyLayerEventToMapState(newState, type, payload);
                    result?.deletedFeatureIds.forEach(id => deletedFeatureIds.add(id));
                    break;
                }
                case 'FeatureGroupCreated':
                case 'FeatureGroupUpdated':
                    applyLayerEventToMapState(newState, type, payload);
                    break;
                case 'FeatureGroupDeleted': {
                    const result = applyLayerEventToMapState(newState, type, payload);
                    result?.deletedFeatureIds.forEach(id => deletedFeatureIds.add(id));
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
        set((s) => ({
            state: normalizedState,
            ...(shouldRefreshViewport ? { viewportRevision: s.viewportRevision + 1 } : {}),
            ...syncUpdatedFeatureCaches(s, updatedFeatureIds, normalizedState),
            ...cleanupDeletedFeatures(s, deletedFeatureIds, normalizedState)
        }));
        if (IS_DEV) {
            console.log(`[Sync] Queued ack applied for ${normalizedState.lastEventId}`);
        }
    },

    applyEventsOptimistically: (events) => {
        const storeState = get();
        const currentState = storeState.state;
        if (!currentState) return;

        const newState = { ...currentState };
        const deletedFeatureIds = new Set<string>();
        const updatedFeatureIds = new Set<string>();
        let shouldRefreshViewport = false;

        const apply = (ev: DesignEventType) => {
            const { type, payload } = ev as any;
            if (!payload) return;

            switch (type) {
                case 'FeatureCreated':
                case 'FeatureUpdated': {
                    if (type === 'FeatureCreated' && hasRenderableCoordinates(payload)) {
                        shouldRefreshViewport = true;
                    }
                    if (!newState.features) newState.features = {};
                    const currentFeature = resolveFeatureById(storeState, newState, payload.id);
                    const fPayload = buildSafeFeaturePatch(currentFeature, payload);
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
                    updatedFeatureIds.add(payload.id);
                    break;
                }
                case 'FeatureDeleted': {
                    if (!newState.features) break;
                    const { [payload.id]: _, ...remainingFeatures } = newState.features;
                    newState.features = remainingFeatures;
                    deletedFeatureIds.add(payload.id);
                    break;
                }
                case 'RegionCreated':
                case 'RegionUpdated':
                    applyLayerEventToMapState(newState, type, payload);
                    break;
                case 'RegionDeleted': {
                    if (!newState.regions) break;
                    const result = applyLayerEventToMapState(newState, type, payload);
                    result?.deletedFeatureIds.forEach(id => deletedFeatureIds.add(id));
                    break;
                }
                case 'LayerCreated':
                case 'LayerUpdated':
                    applyLayerEventToMapState(newState, type, payload);
                    break;
                case 'LayerDeleted': {
                    if (!newState.layers) break;
                    const result = applyLayerEventToMapState(newState, type, payload);
                    result?.deletedFeatureIds.forEach(id => deletedFeatureIds.add(id));
                    break;
                }
                case 'FeatureGroupCreated':
                case 'FeatureGroupUpdated': {
                    applyLayerEventToMapState(newState, type, payload, { normalizeGroupParentId: true });
                    break;
                }
                case 'FeatureGroupDeleted': {
                    if (!newState.feature_groups) break;
                    const result = applyLayerEventToMapState(newState, type, payload);
                    result?.deletedFeatureIds.forEach(id => deletedFeatureIds.add(id));
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
        set((s) => ({
            state: normalizedState,
            ...(shouldRefreshViewport ? { viewportRevision: s.viewportRevision + 1 } : {}),
            ...syncUpdatedFeatureCaches(s, updatedFeatureIds, normalizedState),
            ...cleanupDeletedFeatures(s, deletedFeatureIds, normalizedState)
        }));
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
