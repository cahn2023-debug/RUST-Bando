import type { DesignEventType, FeatureMetadata, FeatureState, LineStringCoordinates } from '@CONTRACT/types';
import { getLineCoordinates, getParsedCoordinates, getPointCoordinates } from '@TOOL/utils/featureMapping';
import { getParsedMetadata } from '@TOOL/utils/featureMetadata';
import {
    getNetworkEndpointKey,
    getNetworkEndpointsFromMetadata,
    getRepresentativeFeatureIdForEndpoint,
    type NetworkEndpointRef,
} from './NetworkEndpoint';

export type NetworkRole = 'cabinet' | 'intersection' | 'device';
export type StoredDirectionMode = 'auto' | 'manual' | 'legacy';

export interface NetworkNodeDescriptor {
    id: string;
    feature: FeatureState;
    metadata: FeatureMetadata;
    role: NetworkRole;
    parentFeatureId?: string;
    isOrigin: boolean;
}

export interface NetworkEdgeDescriptor {
    id: string;
    feature: FeatureState;
    metadata: FeatureMetadata;
    from: string;
    to: string;
    fromEndpoint: NetworkEndpointRef;
    toEndpoint: NetworkEndpointRef;
    fromEndpointKey: string;
    toEndpointKey: string;
    directionMode: StoredDirectionMode;
}

export interface NetworkComponentDescriptor {
    nodeIds: string[];
    edgeIds: string[];
    originIds: string[];
}

export interface OrientedEdgeDescriptor {
    edgeId: string;
    from: string;
    to: string;
    directionMode: StoredDirectionMode;
    state: 'confirmed' | 'pending' | 'conflict';
}

const normalizeText = (value: unknown): string =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

export const isLineFeature = (feature: FeatureState): boolean => {
    const geomType = (feature.geom_type || feature.geometry_type || '').toLowerCase();
    return geomType.includes('line');
};

export const isNetworkEdgeFeature = (feature: FeatureState, metadata: FeatureMetadata = getParsedMetadata(feature) as FeatureMetadata): boolean => {
    const geomType = (feature.geom_type || feature.geometry_type || '').toLowerCase();
    return (geomType.includes('line') && metadata.infrastructure?.type === 'SignalLine') ||
        metadata.infrastructure?.type === 'NetworkLink';
};

export const inferNetworkRole = (feature: FeatureState, metadata: FeatureMetadata = getParsedMetadata(feature) as FeatureMetadata): NetworkRole => {
    const explicitRole = metadata.network?.role;
    if (explicitRole === 'cabinet' || explicitRole === 'intersection' || explicitRole === 'device') return explicitRole;

    const icon = normalizeText(metadata.icon);
    const type = normalizeText((metadata as Record<string, unknown>).type);
    const name = normalizeText(feature.name);

    if (icon === 'intersection' || type.includes('intersection') || type.includes('nut giao') || name.includes('nut giao')) {
        return 'intersection';
    }

    if (['cabinet', 'box', 'server'].includes(icon) || type.includes('cabinet') || type.includes('tu thiet bi') || name.includes('tu thiet bi') || name.includes('tu cap')) {
        return 'cabinet';
    }

    return 'device';
};

export const isSourceRole = (role: NetworkRole): boolean => role === 'cabinet' || role === 'intersection';

export const isPointFeature = (feature: FeatureState): boolean => {
    const geomType = (feature.geom_type || feature.geometry_type || '').toLowerCase();
    return geomType === 'point' || (!!getPointCoordinates(feature) && !isLineFeature(feature));
};

export const getStoredDirectionMode = (metadata: FeatureMetadata): StoredDirectionMode => {
    const mode = metadata.network?.direction_mode;
    if (mode === 'auto' || mode === 'manual') return mode;
    return 'legacy';
};

export const collectNetworkNodes = (featuresById: Record<string, FeatureState>): Map<string, NetworkNodeDescriptor> => {
    const nodes = new Map<string, NetworkNodeDescriptor>();

    for (const feature of Object.values(featuresById)) {
        const metadata = getParsedMetadata(feature) as FeatureMetadata;
        if (isLineFeature(feature) || isNetworkEdgeFeature(feature, metadata)) continue;

        const role = inferNetworkRole(feature, metadata);
        nodes.set(feature.id, {
            id: feature.id,
            feature,
            metadata,
            role,
            parentFeatureId: typeof metadata.parent_feature_id === 'string' ? metadata.parent_feature_id : undefined,
            isOrigin: metadata.network?.is_origin === true,
        });
    }

    return nodes;
};

export const collectNetworkEdges = (featuresById: Record<string, FeatureState>, nodeIds?: Set<string>): NetworkEdgeDescriptor[] => {
    const validNodeIds = nodeIds ?? new Set(collectNetworkNodes(featuresById).keys());
    const edges: NetworkEdgeDescriptor[] = [];

    for (const feature of Object.values(featuresById)) {
        const metadata = getParsedMetadata(feature) as FeatureMetadata;
        if (!isNetworkEdgeFeature(feature, metadata)) continue;

        const { fromEndpoint, toEndpoint } = getNetworkEndpointsFromMetadata(metadata);
        if (!fromEndpoint || !toEndpoint) continue;
        const from = getRepresentativeFeatureIdForEndpoint(fromEndpoint, featuresById);
        const to = getRepresentativeFeatureIdForEndpoint(toEndpoint, featuresById);
        if (!from || !to || !validNodeIds.has(from) || !validNodeIds.has(to) || getNetworkEndpointKey(fromEndpoint) === getNetworkEndpointKey(toEndpoint)) continue;

        edges.push({
            id: feature.id,
            feature,
            metadata,
            from,
            to,
            fromEndpoint,
            toEndpoint,
            fromEndpointKey: getNetworkEndpointKey(fromEndpoint),
            toEndpointKey: getNetworkEndpointKey(toEndpoint),
            directionMode: getStoredDirectionMode(metadata),
        });
    }

    return edges;
};

export const buildNetworkComponents = (featuresById: Record<string, FeatureState>): NetworkComponentDescriptor[] => {
    const nodes = collectNetworkNodes(featuresById);
    const nodeIds = new Set(nodes.keys());
    const edges = collectNetworkEdges(featuresById, nodeIds);
    const adjacency = new Map<string, Set<string>>();
    const edgeIdsByNode = new Map<string, Set<string>>();

    for (const nodeId of nodeIds) {
        adjacency.set(nodeId, new Set());
        edgeIdsByNode.set(nodeId, new Set());
    }

    for (const edge of edges) {
        adjacency.get(edge.from)?.add(edge.to);
        adjacency.get(edge.to)?.add(edge.from);
        edgeIdsByNode.get(edge.from)?.add(edge.id);
        edgeIdsByNode.get(edge.to)?.add(edge.id);
    }

    const visited = new Set<string>();
    const components: NetworkComponentDescriptor[] = [];

    for (const nodeId of nodeIds) {
        if (visited.has(nodeId)) continue;

        const queue = [nodeId];
        const componentNodeIds: string[] = [];
        const componentEdgeIds = new Set<string>();
        visited.add(nodeId);

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;
            componentNodeIds.push(current);

            for (const edgeId of edgeIdsByNode.get(current) || []) {
                componentEdgeIds.add(edgeId);
            }

            for (const neighbor of adjacency.get(current) || []) {
                if (visited.has(neighbor)) continue;
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }

        const originIds = componentNodeIds.filter(id => nodes.get(id)?.isOrigin);
        components.push({
            nodeIds: componentNodeIds,
            edgeIds: [...componentEdgeIds],
            originIds,
        });
    }

    return components;
};

export const getComponentForNode = (featuresById: Record<string, FeatureState>, nodeId: string): NetworkComponentDescriptor | null =>
    buildNetworkComponents(featuresById).find(component => component.nodeIds.includes(nodeId)) || null;

const reverseLineCoordinates = (feature: FeatureState): LineStringCoordinates | undefined => {
    const coords = getLineCoordinates(feature);
    if (!coords || coords.length < 2) return undefined;
    return [...coords].reverse();
};

const buildFeatureUpdateEvent = (
    feature: FeatureState,
    metadata: FeatureMetadata,
    coordinates?: LineStringCoordinates
): DesignEventType => ({
    type: 'FeatureUpdated',
    payload: {
        id: feature.id,
        ...(coordinates ? { coordinates } : {}),
        metadata: JSON.stringify(metadata),
    },
});

const buildAdjacency = (component: NetworkComponentDescriptor, edges: Map<string, NetworkEdgeDescriptor>) => {
    const adjacency = new Map<string, Set<string>>();

    for (const nodeId of component.nodeIds) {
        adjacency.set(nodeId, new Set());
    }

    for (const edgeId of component.edgeIds) {
        const edge = edges.get(edgeId);
        if (!edge) continue;
        adjacency.get(edge.from)?.add(edge.to);
        adjacency.get(edge.to)?.add(edge.from);
    }

    return adjacency;
};

const computeTopologyDistance = (component: NetworkComponentDescriptor, edges: Map<string, NetworkEdgeDescriptor>, originId: string) => {
    const adjacency = buildAdjacency(component, edges);
    const distances = new Map<string, number>([[originId, 0]]);
    const queue = [originId];

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;
        const currentDistance = distances.get(current) ?? 0;

        for (const neighbor of adjacency.get(current) || []) {
            if (distances.has(neighbor)) continue;
            distances.set(neighbor, currentDistance + 1);
            queue.push(neighbor);
        }
    }

    return distances;
};

export const buildSetOriginEvents = (featuresById: Record<string, FeatureState>, originId: string): DesignEventType[] => {
    return buildToggleOriginEvents(featuresById, originId);
};

export const buildToggleOriginEvents = (featuresById: Record<string, FeatureState>, nodeId: string): DesignEventType[] => {
    const nodes = collectNetworkNodes(featuresById);
    const originNode = nodes.get(nodeId);
    if (!originNode) return [];

    const component = getComponentForNode(featuresById, nodeId);
    if (!component) return [];

    const events: DesignEventType[] = [];
    const shouldClear = originNode.isOrigin;
    const nextOriginId = shouldClear ? null : nodeId;
    const edges = new Map(collectNetworkEdges(featuresById, new Set(nodes.keys())).map(edge => [edge.id, edge]));

    for (const nodeId of component.nodeIds) {
        const node = nodes.get(nodeId);
        if (!node) continue;
        const nextMetadata: FeatureMetadata = {
            ...node.metadata,
            network: {
                ...(node.metadata.network || {}),
                ...(shouldClear ? {} : { is_origin: nodeId === nextOriginId }),
            },
        };

        if ((shouldClear && node.metadata.network?.is_origin) || (!shouldClear && node.metadata.network?.is_origin !== (nodeId === nextOriginId))) {
            events.push(buildFeatureUpdateEvent(node.feature, nextMetadata));
        }
    }

    if (shouldClear) return events;
    const distances = computeTopologyDistance(component, edges, nodeId);

    for (const edgeId of component.edgeIds) {
        const edge = edges.get(edgeId);
        if (!edge || edge.directionMode !== 'auto') continue;

        const fromDistance = distances.get(edge.from);
        const toDistance = distances.get(edge.to);
        if (fromDistance === undefined || toDistance === undefined || fromDistance === toDistance) continue;

        const shouldReverse = fromDistance > toDistance;
        const nextFrom = shouldReverse ? edge.to : edge.from;
        const nextTo = shouldReverse ? edge.from : edge.to;
        const nextMetadata: FeatureMetadata = {
            ...edge.metadata,
            network: {
                ...(edge.metadata.network || {}),
                from_feature_id: nextFrom,
                to_feature_id: nextTo,
                direction_mode: 'auto',
            },
        };

        const coordinates = shouldReverse ? reverseLineCoordinates(edge.feature) : undefined;
        const metadataChanged = edge.metadata.network?.from_feature_id !== nextFrom ||
            edge.metadata.network?.to_feature_id !== nextTo ||
            edge.metadata.network?.direction_mode !== 'auto';

        if (metadataChanged || coordinates) {
            events.push(buildFeatureUpdateEvent(edge.feature, nextMetadata, coordinates));
        }
    }

    return events;
};

export const buildManualEdgeDirectionEvent = (feature: FeatureState, reverse = false): DesignEventType | null => {
    const metadata = getParsedMetadata(feature) as FeatureMetadata;
    if (!isNetworkEdgeFeature(feature, metadata)) return null;

    const from = metadata.network?.from_feature_id;
    const to = metadata.network?.to_feature_id;
    if (!from || !to) return null;

    const nextFrom = reverse ? to : from;
    const nextTo = reverse ? from : to;
    const nextMetadata: FeatureMetadata = {
        ...metadata,
        network: {
            ...(metadata.network || {}),
            from_feature_id: nextFrom,
            to_feature_id: nextTo,
            direction_mode: 'manual',
        },
    };

    const coordinates = reverse ? reverseLineCoordinates(feature) : undefined;
    return buildFeatureUpdateEvent(feature, nextMetadata, coordinates);
};

export const buildSnapLinks = (snapIds: Array<string | null | undefined>): Record<string, string> | undefined => {
    const entries = snapIds
        .map((snapId, index) => snapId ? [`v${index}`, snapId] as [string, string] : null)
        .filter((entry): entry is [string, string] => entry !== null);

    if (entries.length === 0) return undefined;
    return Object.fromEntries(entries);
};

export const getPolylineSnapCoordinate = (feature: FeatureState, lng: number, lat: number): [number, number] | null => {
    const coords = getLineCoordinates(feature);
    if (!coords || coords.length < 2) return null;

    let bestPoint: [number, number] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < coords.length - 1; index += 1) {
        const start = coords[index];
        const end = coords[index + 1];
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const lengthSquared = dx * dx + dy * dy;
        if (lengthSquared === 0) continue;

        const t = Math.max(0, Math.min(1, ((lng - start[0]) * dx + (lat - start[1]) * dy) / lengthSquared));
        const projectedLng = start[0] + t * dx;
        const projectedLat = start[1] + t * dy;
        const distance = Math.hypot(projectedLng - lng, projectedLat - lat);

        if (distance < bestDistance) {
            bestDistance = distance;
            bestPoint = [projectedLng, projectedLat];
        }
    }

    return bestPoint;
};

const distanceToPoint = (source: [number, number], target: [number, number]): number =>
    Math.hypot(source[0] - target[0], source[1] - target[1]);

export const resolveNetworkNodeIdFromSnap = (
    featuresById: Record<string, FeatureState>,
    snapFeatureId: string | null | undefined,
    snappedCoordinate?: [number, number] | null
): string | null => {
    if (!snapFeatureId) return null;
    const snapFeature = featuresById[snapFeatureId];
    if (!snapFeature) return null;

    const snapMetadata = getParsedMetadata(snapFeature) as FeatureMetadata;
    if (!isNetworkEdgeFeature(snapFeature, snapMetadata)) {
        return isPointFeature(snapFeature) ? snapFeature.id : null;
    }

    const { fromEndpoint, toEndpoint } = getNetworkEndpointsFromMetadata(snapMetadata);
    const fromId = fromEndpoint ? getRepresentativeFeatureIdForEndpoint(fromEndpoint, featuresById) : null;
    const toId = toEndpoint ? getRepresentativeFeatureIdForEndpoint(toEndpoint, featuresById) : null;
    if (!fromId || !toId) return null;

    const fromFeature = featuresById[fromId];
    const toFeature = featuresById[toId];
    const fromCoords = getPointCoordinates(fromFeature);
    const toCoords = getPointCoordinates(toFeature);
    if (!fromCoords || !toCoords) return null;

    if (!snappedCoordinate) {
        return fromId;
    }

    return distanceToPoint(snappedCoordinate, fromCoords) <= distanceToPoint(snappedCoordinate, toCoords)
        ? fromId
        : toId;
};

export const isPolylineEndpointIndex = (feature: FeatureState, index: number): boolean => {
    const coords = getParsedCoordinates(feature);
    if (!Array.isArray(coords)) return false;
    const geomType = (feature.geom_type || '').toLowerCase();

    if (geomType === 'polygon') {
        if (!Array.isArray(coords[0])) return false;
        const ring = coords[0] as unknown[];
        return index === 0 || index === ring.length - 1;
    }

    return index === 0 || index === coords.length - 1;
};
