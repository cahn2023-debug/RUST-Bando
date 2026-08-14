/**
 * Metadata Utility functions for Features.
 * Handles parsing, caching, and retrieving metadata values.
 */

import { FeatureState, FeatureProperties } from '@CONTRACT/types';

type ParsedMetadata = Record<string, unknown>;
type MetadataCarrier = { metadata?: unknown; properties?: FeatureProperties };

// Cache to avoid repeated JSON parsing
const metadataCache = new Map<string, ParsedMetadata>();

/**
 * Ensures the value is a string, handles specialized object cases (like Protobuf {@type, value})
 */
export const safeString = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === 'string') return value;

    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (obj.value !== undefined && obj.value !== null) {
            return safeString(obj.value);
        }
        try {
            if (Object.keys(obj).length === 0) return "";
            return JSON.stringify(obj);
        } catch {
            return "[Object]";
        }
    }

    return String(value as any);
};

/**
 * Safely parses feature metadata
 */
export const getParsedMetadata = (feature: FeatureState | MetadataCarrier | null | undefined): ParsedMetadata => {
    if (!feature) return {};
    const metaStr = feature.metadata;
    if (!metaStr) return {};
    if (typeof metaStr !== 'string') return metaStr as ParsedMetadata;

    // Cache by the actual metadata string, not by length.
    // Using length caused stale metadata when two different JSON payloads had the same size,
    // which made the second save appear to "not sync" in the map and Project Explorer.
    const cacheKey = `m::${metaStr}`;
    const cached = metadataCache.get(cacheKey);
    if (cached !== undefined) return cached;

    try {
        let cleanStr = metaStr.trim();

        // Handle double-quoted JSON strings (common in some bridge/serialization cases)
        if (cleanStr.startsWith('"') && cleanStr.endsWith('"') && cleanStr.length > 2) {
            try {
                const inner = JSON.parse(cleanStr);
                if (typeof inner === 'object' && inner !== null) {
                    metadataCache.set(cacheKey, inner);
                    return inner;
                }
                if (typeof inner === 'string') {
                    cleanStr = inner.trim();
                }
            } catch { /* ignore */ }
        }

        if (!cleanStr || cleanStr === 'null' || cleanStr === 'undefined') return {};

        const parsed = JSON.parse(cleanStr);

        // Final safety check: if parsed is null (valid JSON but not what we want), return {}
        if (parsed === null || typeof parsed !== 'object') {
            return {};
        }

        metadataCache.set(cacheKey, parsed);

        // Efficient cache eviction (FIFO)
        if (metadataCache.size > 5000) {
            const firstKey = metadataCache.keys().next().value;
            if (firstKey) metadataCache.delete(firstKey);
        }

        return parsed;
    } catch (e) {
        // Only log if it's not a trivially empty or standard null-like string
        if (metaStr && metaStr !== 'null' && metaStr !== 'undefined' && metaStr !== '{}') {
            console.warn(`[Metadata] Failed to parse: "${metaStr.substring(0, 100)}${metaStr.length > 100 ? '...' : ''}"`, e);
        }
        return {};
    }
};

/**
 * Gets a value from metadata supporting nested paths (e.g. gis.abc) and legacy fallbacks
 */
export const getFeatureMetadataValue = (
    feature: FeatureState | MetadataCarrier | null | undefined,
    path: string,
    legacyKey?: string,
    providedMetadata?: ParsedMetadata
): unknown => {
    const meta = providedMetadata || getParsedMetadata(feature);
    if (!meta) return undefined;

    const parts = path.split('.');
    let current: unknown = meta;
    for (const part of parts) {
        if (current === undefined || current === null || typeof current !== 'object') {
            current = undefined;
            break;
        }
        current = (current as Record<string, unknown>)[part];
    }

    if (current !== undefined && current !== null && current !== '') return current;

    if (legacyKey && meta[legacyKey] !== undefined && meta[legacyKey] !== null && meta[legacyKey] !== '') {
        return meta[legacyKey];
    }

    return undefined;
};

/**
 * Retrieves notes from metadata using various common field names
 */
export const getFeatureNote = (feature: FeatureState | MetadataCarrier | null | undefined): string => {
    const meta = getParsedMetadata(feature);
    const rawNote = meta.description || meta.notes || meta.ghi_chu || meta.note || "";
    return safeString(rawNote);
};
/**
 * Retrieves the effective mounting height for a feature, prioritizing feature metadata,
 * then project settings, and finally a hardcoded default.
 */
type ProjectSettings = Record<string, unknown>;

export const getEffectiveMountingHeight = (
    feature: FeatureState | MetadataCarrier | null | undefined,
    settings?: ProjectSettings,
    providedMetadata?: ParsedMetadata
): number => {
    if (!feature) return parseFloat((settings?.default_install_height as number | string | undefined)?.toString() ?? '3.5');

    // 1. Feature specific metadata
    const featureHeight = getFeatureMetadataValue(feature, 'specs.install_height', 'installHeight', providedMetadata);
    if (featureHeight !== undefined && featureHeight !== null && featureHeight !== '') {
        return parseFloat(String(featureHeight as any));
    }

    // 2. Project global setting
    if (settings?.default_install_height !== undefined && settings?.default_install_height !== null) {
        return parseFloat(String(settings.default_install_height as any));
    }

    // 3. Last resort fallback
    return 3.5;
};

/**
 * Retrieves the effective camera specifications for a feature, prioritizing feature metadata,
 * then project's camera presets based on feature type, and finally hardcoded defaults.
 */
type CameraPresets = Record<string, {
    focal_length?: number;
    sensor_size?: string;
    resolution_x?: number;
    resolution_y?: number;
}>;

export const getEffectiveCameraSpecs = (
    feature: FeatureState | MetadataCarrier | null | undefined,
    settings?: ProjectSettings & { camera_presets?: CameraPresets },
    providedMetadata?: ParsedMetadata
): { focalLength: number, sensorSize: string, resolutionX: number, resolutionY: number } => {
    if (!feature) {
        const preset = settings?.camera_presets?.['default'];
        return {
            focalLength: preset?.focal_length ?? 3.6,
            sensorSize: preset?.sensor_size ?? '1/3"',
            resolutionX: preset?.resolution_x ?? 1920,
            resolutionY: preset?.resolution_y ?? 1080
        };
    }

    const meta = providedMetadata || getParsedMetadata(feature);
    const iconKey = typeof feature?.properties?.iconKey === 'string' ? feature.properties.iconKey : 'default';
    const type = (meta.type as string) || iconKey || 'default';
    const preset = settings?.camera_presets?.[type] || settings?.camera_presets?.['default'];

    return {
        focalLength: parseFloat(String((getFeatureMetadataValue(feature, 'specs.focal_length', 'focalLength', providedMetadata) ?? preset?.focal_length ?? 3.6) as any)),
        sensorSize: (getFeatureMetadataValue(feature, 'specs.sensor_size', 'sensorSize', providedMetadata) as string) ?? preset?.sensor_size ?? '1/3"',
        resolutionX: parseInt(String((getFeatureMetadataValue(feature, 'specs.resolution_x', 'resolutionX', providedMetadata) ?? preset?.resolution_x ?? 1920) as any)),
        resolutionY: parseInt(String((getFeatureMetadataValue(feature, 'specs.resolution_y', 'resolutionY', providedMetadata) ?? preset?.resolution_y ?? 1080) as any))
    };
};
