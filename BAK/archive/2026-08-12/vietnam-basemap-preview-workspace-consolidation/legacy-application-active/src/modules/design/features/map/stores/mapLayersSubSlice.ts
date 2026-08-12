import { MapState } from '@CONTRACT/types';

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

export const removeFeaturesFromRecord = <T>(record: Record<string, T>, deletedIds: Set<string>) => {
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

export const applyLayerEventToMapState = (
    state: MapState,
    type: string,
    payload: any,
    options: { normalizeGroupParentId?: boolean } = {}
) => {
    const deletedFeatureIds = new Set<string>();

    switch (type) {
        case 'RegionCreated':
        case 'RegionUpdated':
            if (!state.regions) state.regions = {};
            state.regions = {
                ...state.regions,
                [payload.id]: {
                    ...(state.regions[payload.id] || {}),
                    ...payload
                }
            };
            break;
        case 'RegionDeleted': {
            const cascade = collectContainerDeleteCascade(state, type, payload.id);
            cascade.featureIds.forEach(id => deletedFeatureIds.add(id));
            state.features = removeFeaturesFromRecord(state.features, deletedFeatureIds);
            state.feature_groups = removeIdsFromRecord(state.feature_groups, cascade.groupIds);
            state.layers = removeIdsFromRecord(state.layers, cascade.layerIds);
            state.regions = removeIdsFromRecord(state.regions, cascade.regionIds);
            break;
        }
        case 'LayerCreated':
        case 'LayerUpdated':
            if (!state.layers) state.layers = {};
            state.layers = {
                ...state.layers,
                [payload.id]: {
                    ...(state.layers[payload.id] || {}),
                    ...payload
                }
            };
            break;
        case 'LayerDeleted': {
            const cascade = collectContainerDeleteCascade(state, type, payload.id);
            cascade.featureIds.forEach(id => deletedFeatureIds.add(id));
            state.features = removeFeaturesFromRecord(state.features, deletedFeatureIds);
            state.feature_groups = removeIdsFromRecord(state.feature_groups, cascade.groupIds);
            state.layers = removeIdsFromRecord(state.layers, cascade.layerIds);
            break;
        }
        case 'FeatureGroupCreated':
        case 'FeatureGroupUpdated': {
            if (!state.feature_groups) state.feature_groups = {};
            const groupPayload = { ...payload };
            if (options.normalizeGroupParentId && groupPayload.parent_id === '') {
                groupPayload.parent_id = null;
            }
            state.feature_groups = {
                ...state.feature_groups,
                [payload.id]: {
                    ...(state.feature_groups[payload.id] || {}),
                    ...groupPayload
                }
            };
            break;
        }
        case 'FeatureGroupDeleted': {
            const cascade = collectContainerDeleteCascade(state, type, payload.id);
            cascade.featureIds.forEach(id => deletedFeatureIds.add(id));
            state.features = removeFeaturesFromRecord(state.features, deletedFeatureIds);
            state.feature_groups = removeIdsFromRecord(state.feature_groups, cascade.groupIds);
            break;
        }
        default:
            return null;
    }

    return { deletedFeatureIds };
};
