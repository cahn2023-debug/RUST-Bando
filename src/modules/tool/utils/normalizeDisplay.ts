import { MapState, FeatureState, RegionState, LayerState, FeatureGroupState } from '@CONTRACT/types';
import { FeatureMetadata } from '@CONTRACT/designTypes';
import { calculateFeatureNumbers, syncDisplayOrderAliases } from './featureMapping';
import { normalizeMetadataObject } from './metadataNormalization';

/**
 * Safely converts array or object representation to a proper Record mapping by ID.
 */
const ensureRecord = <T extends { id?: string }>(data: unknown): Record<string, T> => {
    if (!data) return {};
    if (Array.isArray(data)) {
        return data.reduce((acc, item) => {
            const id = item.id || (item as any).feature_id || (item as any).uuid;
            if (id) acc[id] = item;
            return acc;
        }, {} as Record<string, T>);
    }
    if (typeof data === 'object') {
        const obj = data as Record<string, T>;
        const record: Record<string, T> = {};
        for (const [key, val] of Object.entries(obj)) {
            const id = val?.id || (val as any)?.feature_id || (val as any)?.uuid || key;
            record[id] = { ...val, id };
        }
        return record;
    }
    return {};
};

/**
 * Standardizes a single feature for rendering.
 */
export const normalizeFeatureForDisplay = (feature: FeatureState, calculatedSTT?: string): FeatureState => {
    if (!feature) return feature;

    // 1. Parse properties
    let properties = feature.properties;
    if (typeof properties === 'string') {
        try {
            properties = JSON.parse(properties);
        } catch {
            properties = {};
        }
    }
    if (!properties || typeof properties !== 'object') {
        properties = {};
    }

    // 2. Parse metadata (supporting double-encoded string)
    let metadata = feature.metadata;
    while (typeof metadata === 'string') {
        try {
            const parsed = JSON.parse(metadata);
            if (parsed === metadata) break;
            metadata = parsed;
        } catch {
            break;
        }
    }
    if (!metadata || typeof metadata !== 'object') {
        metadata = {};
    }

    // Standardize metadata fields (e.g. description, specs, business, media, gis)
    let normalizedMeta = normalizeMetadataObject(metadata);

    // 3. Parse coordinates (Leaflet expects [lng, lat] for GeoJSON/MapLibre)
    let coordinates = feature.coordinates;
    while (typeof coordinates === 'string') {
        try {
            const parsed = JSON.parse(coordinates);
            if (parsed === coordinates) break;
            coordinates = parsed;
        } catch {
            break;
        }
    }

    // Check if coordinates is empty array or empty object and convert to null
    if (coordinates && (
        (Array.isArray(coordinates) && coordinates.length === 0) ||
        (typeof coordinates === 'object' && !Array.isArray(coordinates) && Object.keys(coordinates).length === 0)
    )) {
        coordinates = null;
    }

    // Try fallback to legacy C# coordinates in properties if standard coordinates are missing
    const rawLat = properties?.Latitude ?? properties?.latitude ?? properties?.Lat ?? properties?.lat ?? properties?.Y ?? properties?.y ?? (properties?.Location as any)?.Latitude;
    const rawLng = properties?.Longitude ?? properties?.longitude ?? properties?.Lng ?? properties?.lng ?? properties?.X ?? properties?.x ?? (properties?.Location as any)?.Longitude;

    if (coordinates === null && rawLat !== undefined && rawLng !== undefined) {
        coordinates = [Number(rawLng), Number(rawLat)];
    } else if (!coordinates) {
        const fallbacks = [
            properties?.coordinates,
            properties?.Coordinates,
            (properties as any)?.geometry?.coordinates,
            (properties as any)?.location?.coordinates,
            (properties as any)?.Location?.coordinates
        ];
        for (const item of fallbacks) {
            if (item) {
                try {
                    coordinates = typeof item === 'string' ? JSON.parse(item) : item;
                } catch {
                    coordinates = null;
                }
                break;
            }
        }
    }

    // 4. Parse & generate bbox
    let bbox = feature.bbox || properties?.bbox || (properties as any)?.BBox;
    while (typeof bbox === 'string') {
        try {
            const parsed = JSON.parse(bbox);
            if (parsed === bbox) break;
            bbox = parsed;
        } catch {
            break;
        }
    }

    if (!bbox && Array.isArray(coordinates) && coordinates.length >= 2) {
        if (typeof coordinates[0] === 'number') {
            bbox = {
                min_x: coordinates[0],
                max_x: coordinates[0],
                min_y: coordinates[1],
                max_y: coordinates[1]
            };
        }
    }

    // 5. Sync STT (display_order) aliases
    if (calculatedSTT) {
        normalizedMeta = syncDisplayOrderAliases(normalizedMeta, calculatedSTT, properties) as FeatureMetadata;
    } else {
        const orderVal = normalizedMeta.display_order || normalizedMeta.stt || normalizedMeta.STT || properties?.stt || properties?.STT || '';
        if (orderVal) {
            normalizedMeta = syncDisplayOrderAliases(normalizedMeta, orderVal, properties) as FeatureMetadata;
        }
    }

    return {
        ...feature,
        properties,
        metadata: normalizedMeta,
        coordinates,
        bbox
    };
};

/**
 * Standardizes the entire MapState canonical representation.
 */
export const normalizeMapStateForDisplay = (state: MapState): MapState => {
    if (!state) return state;

    const regions = ensureRecord<RegionState>(state.regions);
    const layers = ensureRecord<LayerState>(state.layers);
    const feature_groups = ensureRecord<FeatureGroupState>(state.feature_groups);
    const rawFeatures = ensureRecord<FeatureState>(state.features);

    // Standardize feature group metadata
    const normalizedGroups: Record<string, FeatureGroupState> = {};
    for (const [id, group] of Object.entries(feature_groups)) {
        let metadata = group.metadata;
        while (typeof metadata === 'string') {
            try {
                const parsed = JSON.parse(metadata);
                if (parsed === metadata) break;
                metadata = parsed;
            } catch {
                break;
            }
        }
        if (!metadata || typeof metadata !== 'object') {
            metadata = {};
        }
        normalizedGroups[id] = {
            ...group,
            metadata
        };
    }

    // 1. Initial normalization run of features to extract properties and metadata
    const tempFeatures: Record<string, FeatureState> = {};
    for (const [id, f] of Object.entries(rawFeatures)) {
        tempFeatures[id] = normalizeFeatureForDisplay(f);
    }

    // 2. Perform stable sequence calculation for all features
    const featureArray = Object.values(tempFeatures);
    const featureNumbers = calculateFeatureNumbers(featureArray, tempFeatures);

    // 3. Final normalization run matching calculated stable display sequence order (STT)
    const features: Record<string, FeatureState> = {};
    for (const [id, f] of Object.entries(tempFeatures)) {
        features[id] = normalizeFeatureForDisplay(f, featureNumbers[id]);
    }

    return {
        ...state,
        regions,
        layers,
        feature_groups: normalizedGroups,
        features,
        settings: state.settings || {}
    };
};
