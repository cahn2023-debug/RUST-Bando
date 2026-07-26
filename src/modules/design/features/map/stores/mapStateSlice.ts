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

const collectDescendantGroupIds = (state: MapState, rootGroupIds: Iterable<string>) => {
    const collected = new Set<string>();
    const pending = Array.from(rootGroupIds).filter(Boolean);

    while (pending.length > 0) {
        const groupId = pending.pop();
        if (!groupId || collected.has(groupId)) continue;
        collected.add(groupId);

        Object.values(state.feature_groups || {}).forEach((group: any) => {
            if (String(group.parent_id || '') === groupId) {
                pending.push(group.id);
            }
        });
    }

    return collected;
};

const collectDescendantRegionIds = (state: MapState, rootRegionIds: Iterable<string>) => {
    const collected = new Set<string>();
    const pending = Array.from(rootRegionIds).filter(Boolean);

    while (pending.length > 0) {
        const regionId = pending.pop();
        if (!regionId || collected.has(regionId)) continue;
        collected.add(regionId);

        Object.values(state.regions || {}).forEach((region: any) => {
            if (String(region.parent_id || '') === regionId) {
                pending.push(region.id);
            }
        });
    }

    return collected;
};

const collectFeatureIdsForContainerDelete = (state: MapState, type: string, id: string) => {
    if (!id) return [];

    const layerIds = new Set<string>();
    const groupIds = new Set<string>();

    if (type === 'FeatureGroupDeleted') {
        collectDescendantGroupIds(state, [id]).forEach(groupId => groupIds.add(groupId));
    } else if (type === 'LayerDeleted') {
        layerIds.add(id);
    } else if (type === 'RegionDeleted') {
        const regionIds = collectDescendantRegionIds(state, [id]);
        Object.values(state.layers || {}).forEach((layer: any) => {
            if (regionIds.has(String(layer.region_id || ''))) {
                layerIds.add(layer.id);
            }
        });
    }

    if (layerIds.size > 0) {
        Object.values(state.feature_groups || {}).forEach((group: any) => {
            if (layerIds.has(String(group.layer_id || ''))) {
                groupIds.add(group.id);
            }
        });
        collectDescendantGroupIds(state, groupIds).forEach(groupId => groupIds.add(groupId));
    }

    return Object.values(state.features || {})
        .filter((feature: any) => (
            groupIds.has(String(feature.group_id || '')) ||
            layerIds.has(String(feature.layer_id || ''))
        ))
        .map((feature: any) => feature.id)
        .filter(Boolean);
};

const collectContainerDeleteCascade = (state: MapState, type: string, id: string) => {
    const regionIds = type === 'RegionDeleted'
        ? collectDescendantRegionIds(state, [id])
        : new Set<string>();
    const layerIds = new Set<string>();
    const rootGroupIds = new Set<string>();

    if (type === 'LayerDeleted') {
        layerIds.add(id);
    } else if (type === 'RegionDeleted') {
        Object.values(state.layers || {}).forEach((layer: any) => {
            if (regionIds.has(String(layer.region_id || ''))) {
                layerIds.add(layer.id);
            }
        });
    } else if (type === 'FeatureGroupDeleted') {
        rootGroupIds.add(id);
    }

    if (layerIds.size > 0) {
        Object.values(state.feature_groups || {}).forEach((group: any) => {
            if (layerIds.has(String(group.layer_id || ''))) {
                rootGroupIds.add(group.id);
            }
        });
    }

    const groupIds = collectDescendantGroupIds(state, rootGroupIds);
    const featureIds = collectFeatureIdsForContainerDelete(state, type, id);

    return { regionIds, layerIds, groupIds, featureIds };
};

const removeFeaturesFromRecord = <T>(record: Record<string, T>, deletedIds: Set<string>) => {
    if (deletedIds.size === 0) return record;
    let changed = false;
    const next: Record<string, T> = {};
    Object.entries(record || {}).forEach(([id, value]) => {
        if (deletedIds.has(id)) {
            changed = true;
            return;
        }
        next[id] = value;
    });
    return changed ? next : record;
};

const removeIdsFromRecord = <T>(record: Record<string, T> | undefined, deletedIds: Set<string>) => {
    if (!record || deletedIds.size === 0) return record || {};
    const next: Record<string, T> = {};
    Object.entries(record).forEach(([id, value]) => {
        if (!deletedIds.has(id)) next[id] = value;
    });
    return next;
};

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
    visibleFeatures: {},
    visibleFeatureIds: [],
    featureDetailsCache: {},
    viewportRevision: 0,
    isViewportLoading: false,
    viewportFeatureTotal: 0,
    isViewportTruncated: false,

    // Giai đoạn 5: Optimistic UI state
    pendingSyncEvents: [],

    setViewportFeatures: (features, total, truncated) => {
        const visibleFeatures = Object.fromEntries(features.map(feature => [feature.id, feature]));
        set((s) => ({
            visibleFeatures,
            visibleFeatureIds: features.map(feature => feature.id),
            viewportFeatureTotal: total,
            isViewportTruncated: truncated,
            featureDetailsCache: {
                ...s.featureDetailsCache,
                ...visibleFeatures
            }
        }));
    },

    setViewportLoading: (isViewportLoading) => set({ isViewportLoading }),

    cacheFeatureDetail: (feature) => set((s) => ({
        featureDetailsCache: {
            ...s.featureDetailsCache,
            [feature.id]: feature
        },
        visibleFeatures: s.visibleFeatures[feature.id]
            ? { ...s.visibleFeatures, [feature.id]: feature }
            : s.visibleFeatures
    })),

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
        const deletedFeatureIds = new Set<string>();

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
                    deletedFeatureIds.add(payload.id);
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
                    const cascade = collectContainerDeleteCascade(newState, type, payload.id);
                    cascade.featureIds.forEach(id => deletedFeatureIds.add(id));
                    newState.features = removeFeaturesFromRecord(newState.features, deletedFeatureIds);
                    newState.feature_groups = removeIdsFromRecord(newState.feature_groups, cascade.groupIds);
                    newState.layers = removeIdsFromRecord(newState.layers, cascade.layerIds);
                    newState.regions = removeIdsFromRecord(newState.regions, cascade.regionIds);
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
                    const cascade = collectContainerDeleteCascade(newState, type, payload.id);
                    cascade.featureIds.forEach(id => deletedFeatureIds.add(id));
                    newState.features = removeFeaturesFromRecord(newState.features, deletedFeatureIds);
                    newState.feature_groups = removeIdsFromRecord(newState.feature_groups, cascade.groupIds);
                    newState.layers = removeIdsFromRecord(newState.layers, cascade.layerIds);
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
                    const cascade = collectContainerDeleteCascade(newState, type, payload.id);
                    cascade.featureIds.forEach(id => deletedFeatureIds.add(id));
                    newState.features = removeFeaturesFromRecord(newState.features, deletedFeatureIds);
                    newState.feature_groups = removeIdsFromRecord(newState.feature_groups, cascade.groupIds);
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
        set((s) => ({ state: normalizedState, ...cleanupDeletedFeatures(s, deletedFeatureIds, normalizedState) }));
        if (IS_DEV) {
            console.log(`[Sync] Patch applied for ${normalizedState.lastEventId}`);
        }
    },

    applyQueuedAckToState: (response) => {
        const currentState = get().state;
        if (!currentState) return;

        const newState = { ...currentState };
        const deletedFeatureIds = new Set<string>();

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
                    deletedFeatureIds.add(payload.id);
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
                    const cascade = collectContainerDeleteCascade(newState, type, payload.id);
                    cascade.featureIds.forEach(id => deletedFeatureIds.add(id));
                    newState.features = removeFeaturesFromRecord(newState.features, deletedFeatureIds);
                    newState.feature_groups = removeIdsFromRecord(newState.feature_groups, cascade.groupIds);
                    newState.layers = removeIdsFromRecord(newState.layers, cascade.layerIds);
                    newState.regions = removeIdsFromRecord(newState.regions, cascade.regionIds);
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
                    const cascade = collectContainerDeleteCascade(newState, type, payload.id);
                    cascade.featureIds.forEach(id => deletedFeatureIds.add(id));
                    newState.features = removeFeaturesFromRecord(newState.features, deletedFeatureIds);
                    newState.feature_groups = removeIdsFromRecord(newState.feature_groups, cascade.groupIds);
                    newState.layers = removeIdsFromRecord(newState.layers, cascade.layerIds);
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
                    const cascade = collectContainerDeleteCascade(newState, type, payload.id);
                    cascade.featureIds.forEach(id => deletedFeatureIds.add(id));
                    newState.features = removeFeaturesFromRecord(newState.features, deletedFeatureIds);
                    newState.feature_groups = removeIdsFromRecord(newState.feature_groups, cascade.groupIds);
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
        set((s) => ({ state: normalizedState, ...cleanupDeletedFeatures(s, deletedFeatureIds, normalizedState) }));
        if (IS_DEV) {
            console.log(`[Sync] Queued ack applied for ${normalizedState.lastEventId}`);
        }
    },

    applyEventsOptimistically: (events) => {
        const currentState = get().state;
        if (!currentState) return;

        const newState = { ...currentState };
        const deletedFeatureIds = new Set<string>();

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
                    deletedFeatureIds.add(payload.id);
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
                    const cascade = collectContainerDeleteCascade(newState, type, payload.id);
                    cascade.featureIds.forEach(id => deletedFeatureIds.add(id));
                    newState.features = removeFeaturesFromRecord(newState.features, deletedFeatureIds);
                    newState.feature_groups = removeIdsFromRecord(newState.feature_groups, cascade.groupIds);
                    newState.layers = removeIdsFromRecord(newState.layers, cascade.layerIds);
                    newState.regions = removeIdsFromRecord(newState.regions, cascade.regionIds);
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
                    const cascade = collectContainerDeleteCascade(newState, type, payload.id);
                    cascade.featureIds.forEach(id => deletedFeatureIds.add(id));
                    newState.features = removeFeaturesFromRecord(newState.features, deletedFeatureIds);
                    newState.feature_groups = removeIdsFromRecord(newState.feature_groups, cascade.groupIds);
                    newState.layers = removeIdsFromRecord(newState.layers, cascade.layerIds);
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
                    const cascade = collectContainerDeleteCascade(newState, type, payload.id);
                    cascade.featureIds.forEach(id => deletedFeatureIds.add(id));
                    newState.features = removeFeaturesFromRecord(newState.features, deletedFeatureIds);
                    newState.feature_groups = removeIdsFromRecord(newState.feature_groups, cascade.groupIds);
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
        set((s) => ({ state: normalizedState, ...cleanupDeletedFeatures(s, deletedFeatureIds, normalizedState) }));
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
