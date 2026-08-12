import type { FeatureState } from '@CONTRACT/types';
import { getParsedCoordinates, getParsedMetadata, getPointCoordinates } from '@TOOL/utils/featureUtils';

export interface PolylineSnapMarker {
    index: number;
    targetId: string;
    coordinate: [number, number];
}

const asRecord = (value: unknown): Record<string, unknown> => {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return {};
        try {
            let cleanStr = trimmed;
            if (cleanStr.startsWith('"') && cleanStr.endsWith('"') && cleanStr.length > 2) {
                try {
                    const inner = JSON.parse(cleanStr);
                    if (typeof inner === 'object' && inner !== null && !Array.isArray(inner)) {
                        return inner as Record<string, unknown>;
                    }
                    if (typeof inner === 'string') cleanStr = inner.trim();
                } catch {
                    cleanStr = cleanStr.slice(1, -1).trim();
                }
            }
            const parsed = JSON.parse(cleanStr);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return {};
        }
    }
    return {};
};

const asFeatureRecord = (features: unknown): Record<string, FeatureState> => {
    if (!features) return {};
    if (Array.isArray(features)) {
        const record: Record<string, FeatureState> = {};
        for (const f of features) {
            if (f && typeof f === 'object' && typeof (f as any).id === 'string') {
                record[(f as any).id] = f as FeatureState;
            }
        }
        return record;
    }
    if (typeof features === 'object') {
        return features as Record<string, FeatureState>;
    }
    return {};
};

export const getLineCoordinateList = (feature: FeatureState | null | undefined): [number, number][] => {
    if (!feature) return [];
    const parsed = getParsedCoordinates(feature);
    if (!Array.isArray(parsed)) return [];
    if (!Array.isArray(parsed[0])) return [];
    return parsed
        .map((coordinate: unknown) => {
            if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
            const lng = Number(coordinate[0]);
            const lat = Number(coordinate[1]);
            return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] as [number, number] : null;
        })
        .filter((coordinate): coordinate is [number, number] => coordinate !== null);
};

export const buildPolylineSnapMarkers = (
    feature: FeatureState | null | undefined,
    featuresById: Record<string, FeatureState> | unknown,
    metadataInput?: Record<string, unknown> | null
): PolylineSnapMarker[] => {
    const coordinates = getLineCoordinateList(feature);
    if (!feature || coordinates.length < 2) return [];

    const metadata = (metadataInput && typeof metadataInput === 'object' && !Array.isArray(metadataInput) && Object.keys(metadataInput).length > 0)
        ? metadataInput
        : getParsedMetadata(feature);
    const featureRecord = asFeatureRecord(featuresById);
    const snapIdsByIndex = new Map<number, string>();
    const snapLinks = asRecord(metadata.snap_links);

    for (const [key, value] of Object.entries(snapLinks)) {
        const match = /^v(\d+)$/.exec(key);
        if (!match || typeof value !== 'string' || !value) continue;
        snapIdsByIndex.set(Number(match[1]), value);
    }

    const network = asRecord(metadata.network);
    const fromEndpoint = asRecord(network.from_endpoint);
    const toEndpoint = asRecord(network.to_endpoint);

    const startNodeId = (typeof metadata.start_node_id === 'string' && metadata.start_node_id)
        || (typeof network.from_feature_id === 'string' && network.from_feature_id)
        || (typeof fromEndpoint.id === 'string' && fromEndpoint.id)
        || null;

    const endNodeId = (typeof metadata.end_node_id === 'string' && metadata.end_node_id)
        || (typeof network.to_feature_id === 'string' && network.to_feature_id)
        || (typeof toEndpoint.id === 'string' && toEndpoint.id)
        || null;

    if (startNodeId && !snapIdsByIndex.has(0)) {
        snapIdsByIndex.set(0, startNodeId);
    }
    if (endNodeId && !snapIdsByIndex.has(coordinates.length - 1)) {
        snapIdsByIndex.set(coordinates.length - 1, endNodeId);
    }

    return Array.from(snapIdsByIndex.entries())
        .sort(([left], [right]) => left - right)
        .map(([index, targetId]) => {
            const vertexCoordinate = coordinates[index];
            if (!vertexCoordinate) return null;
            const targetCoordinate = featureRecord[targetId] ? getPointCoordinates(featureRecord[targetId]) : null;
            return {
                index,
                targetId,
                coordinate: targetCoordinate || vertexCoordinate,
            };
        })
        .filter((marker): marker is PolylineSnapMarker => marker !== null);
};

