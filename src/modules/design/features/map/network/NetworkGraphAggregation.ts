import { getPointCoordinates } from '@TOOL/utils/featureUtils';
import type { NetworkEdge, NetworkNode } from './NetworkGraphService';
import {
    createFeatureEndpointRef,
    getNetworkEndpointKey,
    type NetworkEndpointRef,
} from './NetworkEndpoint';

export interface DisplayNetworkNode {
    id: string;
    representative: NetworkNode;
    memberIds: string[];
    memberLabels: string[];
    memberCount: number;
    groupId: string | null;
    ownerIntersectionId: string | null;
    layerId: string | null;
    endpointRef: NetworkEndpointRef;
    endpointKey: string;
}

export interface DisplayNetworkEdge {
    id: string;
    representative: NetworkEdge;
    from: string;
    to: string;
    memberEdgeIds: string[];
    fromEndpointKey: string;
    toEndpointKey: string;
}

export interface DisplayNetworkGraph {
    nodes: DisplayNetworkNode[];
    edges: DisplayNetworkEdge[];
    displayNodeIdByRawNodeId: Record<string, string>;
    displayNodeIdByEndpointKey: Record<string, string>;
}

const SHARED_POINT_THRESHOLD_METERS = 0.6;

const toRadians = (value: number) => (value * Math.PI) / 180;

const getDistanceMeters = (from: [number, number], to: [number, number]) => {
    const earthRadiusMeters = 6371000;
    const dLat = toRadians(to[1] - from[1]);
    const dLon = toRadians(to[0] - from[0]);
    const lat1 = toRadians(from[1]);
    const lat2 = toRadians(to[1]);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusMeters * c;
};

const chooseRepresentativeEdge = (current: DisplayNetworkEdge, candidate: NetworkEdge): DisplayNetworkEdge => {
    if (current.representative.sourceType === 'network-drawn' && candidate.sourceType === 'map-polyline') {
        return {
            ...current,
            representative: candidate,
            id: candidate.id,
        };
    }

    return current;
};

export const buildDisplayNetworkGraph = (
    nodes: NetworkNode[],
    edges: NetworkEdge[],
    scopedIntersectionId: string | null
): DisplayNetworkGraph => {
    const displayNodes = new Map<string, DisplayNetworkNode>();
    const displayNodeIdByRawNodeId: Record<string, string> = {};
    const displayNodeIdByEndpointKey: Record<string, string> = {};
    const deviceClusters = new Map<string, string[]>();

    if (scopedIntersectionId) {
        const candidateDevices = nodes.filter(node =>
            node.role === 'device' &&
            node.parentFeatureId === scopedIntersectionId &&
            !!getPointCoordinates(node.feature)
        );
        const visited = new Set<string>();

        for (const device of candidateDevices) {
            if (visited.has(device.id)) continue;

            const queue = [device];
            const cluster: string[] = [];
            visited.add(device.id);

            while (queue.length > 0) {
                const current = queue.shift();
                if (!current) continue;
                cluster.push(current.id);
                const currentPoint = getPointCoordinates(current.feature);
                if (!currentPoint) continue;

                for (const candidate of candidateDevices) {
                    if (visited.has(candidate.id)) continue;
                    const candidatePoint = getPointCoordinates(candidate.feature);
                    if (!candidatePoint) continue;
                    if (getDistanceMeters(currentPoint, candidatePoint) >= SHARED_POINT_THRESHOLD_METERS) continue;

                    visited.add(candidate.id);
                    queue.push(candidate);
                }
            }

            if (cluster.length > 1) {
                deviceClusters.set(cluster[0], cluster);
            }
        }
    }

    for (const node of nodes) {
        let displayId = node.id;
        let endpointRef: NetworkEndpointRef = createFeatureEndpointRef(node.id);
        const ownerIntersectionId = scopedIntersectionId && node.parentFeatureId === scopedIntersectionId
            ? scopedIntersectionId
            : node.role === 'intersection'
                ? node.id
                : node.parentFeatureId || null;

        if (scopedIntersectionId && node.role === 'device' && node.parentFeatureId === scopedIntersectionId) {
            const clusterEntry = [...deviceClusters.entries()].find(([, memberIds]) => memberIds.includes(node.id));
            if (clusterEntry) {
                displayId = `intersection:${scopedIntersectionId}:distance:${clusterEntry[0]}`;
                const clusterMembers = clusterEntry[1];
                const clusterCoordinates = clusterMembers
                    .map(memberId => nodes.find(item => item.id === memberId))
                    .map(memberNode => memberNode ? getPointCoordinates(memberNode.feature) : null)
                    .filter((coordinate): coordinate is [number, number] => !!coordinate);
                const coordinate = clusterCoordinates.length > 0
                    ? ([
                        clusterCoordinates.reduce((sum, [lng]) => sum + lng, 0) / clusterCoordinates.length,
                        clusterCoordinates.reduce((sum, [, lat]) => sum + lat, 0) / clusterCoordinates.length,
                    ] as [number, number])
                    : getPointCoordinates(node.feature) || [0, 0];
                endpointRef = {
                    type: 'shared-point',
                    id: displayId,
                    intersection_id: scopedIntersectionId,
                    member_ids: clusterMembers,
                    coordinate,
                };
            }
        }

        const endpointKey = getNetworkEndpointKey(endpointRef);

        const existing = displayNodes.get(displayId);

        displayNodeIdByRawNodeId[node.id] = displayId;
        displayNodeIdByEndpointKey[getNetworkEndpointKey(createFeatureEndpointRef(node.id))] = displayId;
        displayNodeIdByEndpointKey[endpointKey] = displayId;

        if (!existing) {
            displayNodes.set(displayId, {
                id: displayId,
                representative: node,
                memberIds: [node.id],
                memberLabels: [node.label],
                memberCount: 1,
                groupId: node.feature.group_id || null,
                ownerIntersectionId,
                layerId: node.feature.layer_id || null,
                endpointRef,
                endpointKey,
            });
            continue;
        }

        existing.memberIds.push(node.id);
        existing.memberLabels.push(node.label);
        existing.memberCount += 1;
    }

    const displayEdges = new Map<string, DisplayNetworkEdge>();

    for (const edge of edges) {
        const from = displayNodeIdByEndpointKey[edge.fromEndpointKey] || displayNodeIdByRawNodeId[edge.from] || edge.from;
        const to = displayNodeIdByEndpointKey[edge.toEndpointKey] || displayNodeIdByRawNodeId[edge.to] || edge.to;
        if (from === to) continue;

        const edgeKey = `${from}->${to}:${edge.kind}:${edge.sourceType}`;
        const existing = displayEdges.get(edgeKey);
        if (!existing) {
            displayEdges.set(edgeKey, {
                id: edge.id,
                representative: edge,
                from,
                to,
                memberEdgeIds: [edge.id],
                fromEndpointKey: edge.fromEndpointKey,
                toEndpointKey: edge.toEndpointKey,
            });
            continue;
        }

        existing.memberEdgeIds.push(edge.id);
        displayEdges.set(edgeKey, chooseRepresentativeEdge(existing, edge));
    }

    return {
        nodes: [...displayNodes.values()],
        edges: [...displayEdges.values()],
        displayNodeIdByRawNodeId,
        displayNodeIdByEndpointKey,
    };
};
