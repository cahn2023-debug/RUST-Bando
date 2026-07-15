import type {
    NetworkEndpointMetadata,
    NetworkFeatureEndpointMetadata,
    NetworkSharedPointEndpointMetadata,
} from '@CONTRACT/designTypes';
import type { FeatureState, FeatureMetadata } from '@CONTRACT/types';
import { getPointCoordinates } from '@TOOL/utils/featureMapping';

export type NetworkEndpointRef = NetworkEndpointMetadata;
export type NetworkFeatureEndpointRef = NetworkFeatureEndpointMetadata;
export type NetworkSharedPointEndpointRef = NetworkSharedPointEndpointMetadata;

export interface NetworkConnectionDraft {
    fromEndpoint: NetworkEndpointRef;
    toEndpoint: NetworkEndpointRef;
}

const isCoordinate = (value: unknown): value is [number, number] =>
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number';

export const isNetworkFeatureEndpoint = (value: unknown): value is NetworkFeatureEndpointRef =>
    !!value &&
    typeof value === 'object' &&
    (value as NetworkFeatureEndpointRef).type === 'feature' &&
    typeof (value as NetworkFeatureEndpointRef).id === 'string';

export const isNetworkSharedPointEndpoint = (value: unknown): value is NetworkSharedPointEndpointRef =>
    !!value &&
    typeof value === 'object' &&
    (value as NetworkSharedPointEndpointRef).type === 'shared-point' &&
    typeof (value as NetworkSharedPointEndpointRef).id === 'string' &&
    typeof (value as NetworkSharedPointEndpointRef).intersection_id === 'string' &&
    Array.isArray((value as NetworkSharedPointEndpointRef).member_ids) &&
    (value as NetworkSharedPointEndpointRef).member_ids.every((memberId: unknown) => typeof memberId === 'string') &&
    isCoordinate((value as NetworkSharedPointEndpointRef).coordinate);

export const parseNetworkEndpointRef = (value: unknown): NetworkEndpointRef | null => {
    if (isNetworkFeatureEndpoint(value)) return value;
    if (isNetworkSharedPointEndpoint(value)) return value;
    return null;
};

export const createFeatureEndpointRef = (featureId: string): NetworkFeatureEndpointRef => ({
    type: 'feature',
    id: featureId,
});

export const getNetworkEndpointKey = (endpoint: NetworkEndpointRef): string =>
    endpoint.type === 'feature'
        ? `feature:${endpoint.id}`
        : `shared-point:${endpoint.id}`;

export const getRepresentativeFeatureIdForEndpoint = (
    endpoint: NetworkEndpointRef,
    featuresById: Record<string, FeatureState>
): string | null => {
    if (endpoint.type === 'feature') {
        return featuresById[endpoint.id] ? endpoint.id : null;
    }

    for (const memberId of endpoint.member_ids) {
        if (featuresById[memberId]) return memberId;
    }

    return null;
};

export const getNetworkEndpointCoordinate = (
    endpoint: NetworkEndpointRef,
    featuresById: Record<string, FeatureState>
): [number, number] | null => {
    if (endpoint.type === 'shared-point') {
        return endpoint.coordinate;
    }

    const feature = featuresById[endpoint.id];
    if (!feature) return null;
    return getPointCoordinates(feature);
};

export const getDraftEndpointLabel = (
    endpoint: NetworkEndpointRef,
    featuresById: Record<string, FeatureState>
): string => {
    if (endpoint.type === 'feature') {
        return featuresById[endpoint.id]?.name || endpoint.id;
    }

    const labels = endpoint.member_ids
        .map((memberId: string) => featuresById[memberId]?.name || memberId)
        .filter(Boolean);
    const leadLabel = labels[0] || endpoint.id;
    return endpoint.member_ids.length > 1
        ? `${leadLabel} +${endpoint.member_ids.length - 1}`
        : leadLabel;
};

export const getNetworkEndpointsFromMetadata = (metadata: FeatureMetadata): {
    fromEndpoint: NetworkEndpointRef | null;
    toEndpoint: NetworkEndpointRef | null;
} => {
    const fromEndpoint = parseNetworkEndpointRef(metadata.network?.from_endpoint) ||
        (typeof metadata.network?.from_feature_id === 'string' ? createFeatureEndpointRef(metadata.network.from_feature_id) : null);
    const toEndpoint = parseNetworkEndpointRef(metadata.network?.to_endpoint) ||
        (typeof metadata.network?.to_feature_id === 'string' ? createFeatureEndpointRef(metadata.network.to_feature_id) : null);

    return { fromEndpoint, toEndpoint };
};
