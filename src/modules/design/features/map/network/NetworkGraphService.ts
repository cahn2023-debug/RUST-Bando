import type { FeatureMetadata, FeatureState } from '@CONTRACT/types';
import {
    buildNetworkComponents,
    collectNetworkEdges,
    collectNetworkNodes,
    isNetworkEdgeFeature,
    isSourceRole,
    type NetworkRole,
} from './networkTopology';

export type NetworkEntityStatus = 'online' | 'offline' | 'unknown';
export type NetworkComputedStatus =
    | 'online'
    | 'direct-offline'
    | 'upstream-offline'
    | 'unknown'
    | 'configuration-error';

export interface NetworkStatusSnapshot {
    nodes?: Record<string, NetworkEntityStatus>;
    edges?: Record<string, NetworkEntityStatus>;
}

export interface NetworkNode {
    id: string;
    label: string;
    role: NetworkRole;
    networkRole: NetworkRole;
    isInferredRole: boolean;
    telemetryId?: string;
    parentFeatureId?: string;
    isOrigin: boolean;
    feature: FeatureState;
}

export interface NetworkEdge {
    id: string;
    label: string;
    from: string;
    to: string;
    kind: 'signal' | 'relationship';
    telemetryId?: string;
    feature?: FeatureState;
    directionMode: 'auto' | 'manual' | 'legacy';
    directionState: 'confirmed' | 'pending' | 'conflict';
}

export interface NetworkDiagnostic {
    type:
    | 'missing-endpoint'
    | 'self-loop'
    | 'unknown-node'
    | 'duplicate-edge'
    | 'missing-origin'
    | 'multiple-origins'
    | 'ambiguous-direction';
    edgeId?: string;
    featureId?: string;
    message: string;
}

export interface NetworkNodeState {
    nodeId: string;
    status: NetworkComputedStatus;
    reason: string;
    affectedDownstream: string[];
}

export interface NetworkGraph {
    nodes: NetworkNode[];
    edges: NetworkEdge[];
    diagnostics: NetworkDiagnostic[];
}

export interface NetworkEvaluation extends NetworkGraph {
    nodeStates: Record<string, NetworkNodeState>;
}

const parseMetadata = (metadata: FeatureState['metadata']): FeatureMetadata => {
    if (!metadata) return {};
    if (typeof metadata === 'string') {
        try {
            return JSON.parse(metadata || '{}') as FeatureMetadata;
        } catch {
            return {};
        }
    }
    return metadata as FeatureMetadata;
};

const getEntityStatus = (
    entityId: string,
    telemetryId: string | undefined,
    statuses: Record<string, NetworkEntityStatus> | undefined
): NetworkEntityStatus => {
    if (!statuses) return 'unknown';
    if (telemetryId && statuses[telemetryId]) return statuses[telemetryId];
    return statuses[entityId] ?? 'unknown';
};

const collectDownstream = (
    startId: string,
    outgoing: Map<string, NetworkEdge[]>,
    excludedEdgeId?: string
): string[] => {
    const affected = new Set<string>();
    const queue = [startId];

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || affected.has(current)) continue;
        affected.add(current);

        for (const edge of outgoing.get(current) || []) {
            if (edge.id !== excludedEdgeId) queue.push(edge.to);
        }
    }

    return [...affected];
};

const computeDistances = (originId: string, edgeMap: Map<string, NetworkEdge>): Map<string, number> => {
    const adjacency = new Map<string, Set<string>>();
    for (const edge of edgeMap.values()) {
        if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
        if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
        adjacency.get(edge.from)?.add(edge.to);
        adjacency.get(edge.to)?.add(edge.from);
    }

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

const mapNodes = (featuresById: Record<string, FeatureState>): NetworkNode[] => {
    const nodes = collectNetworkNodes(featuresById);

    return [...nodes.values()].map(node => {
        const explicitRole = node.metadata.network?.role;
        return {
            id: node.id,
            label: node.feature.name || node.id,
            role: node.role,
            networkRole: node.role,
            isInferredRole: explicitRole !== 'cabinet' && explicitRole !== 'intersection' && explicitRole !== 'device',
            telemetryId: node.metadata.network?.telemetry_id,
            parentFeatureId: node.parentFeatureId,
            isOrigin: node.isOrigin,
            feature: node.feature,
        };
    });
};

export const NetworkGraphService = {
    build(featuresById: Record<string, FeatureState>): NetworkGraph {
        const nodes = mapNodes(featuresById);
        const diagnostics: NetworkDiagnostic[] = [];
        const nodeIds = new Set(nodes.map(node => node.id));
        const edgePairs = new Map<string, string>();
        const duplicateEdgeIds = new Set<string>();
        const rawEdges = collectNetworkEdges(featuresById, nodeIds);
        const edgeMap = new Map<string, NetworkEdge>();
        const components = buildNetworkComponents(featuresById);

        for (const feature of Object.values(featuresById)) {
            const metadata = parseMetadata(feature.metadata);
            if (!isNetworkEdgeFeature(feature, metadata)) continue;

            const from = metadata.network?.from_feature_id;
            const to = metadata.network?.to_feature_id;

            if (!from || !to) {
                diagnostics.push({
                    type: 'missing-endpoint',
                    edgeId: feature.id,
                    message: `Network link ${feature.id} is missing from_feature_id or to_feature_id.`,
                });
                continue;
            }

            if (from === to) {
                diagnostics.push({
                    type: 'self-loop',
                    edgeId: feature.id,
                    message: `Network link ${feature.id} points to itself.`,
                });
                continue;
            }

            const missing = [from, to].filter(id => !nodeIds.has(id));
            if (missing.length > 0) {
                diagnostics.push({
                    type: 'unknown-node',
                    edgeId: feature.id,
                    message: `Network link ${feature.id} references unknown node(s): ${missing.join(', ')}.`,
                });
                continue;
            }

            const pairKey = `${from}->${to}`;
            const previousEdgeId = edgePairs.get(pairKey);
            if (previousEdgeId) {
                duplicateEdgeIds.add(feature.id);
                diagnostics.push({
                    type: 'duplicate-edge',
                    edgeId: feature.id,
                    message: `Network link ${feature.id} duplicates ${previousEdgeId}.`,
                });
                continue;
            }

            edgePairs.set(pairKey, feature.id);
        }

        for (const edge of rawEdges) {
            if (duplicateEdgeIds.has(edge.id)) continue;
            edgeMap.set(edge.id, {
                id: edge.id,
                label: edge.feature.name || edge.id,
                from: edge.from,
                to: edge.to,
                kind: 'signal',
                telemetryId: edge.metadata.network?.telemetry_id,
                feature: edge.feature,
                directionMode: edge.directionMode,
                directionState: edge.directionMode === 'legacy' || edge.directionMode === 'manual' ? 'confirmed' : 'pending',
            });
        }

        for (const component of components) {
            const componentEdges = component.edgeIds
                .map(edgeId => edgeMap.get(edgeId))
                .filter((edge): edge is NetworkEdge => !!edge);

            const hasAutoEdges = componentEdges.some(edge => edge.directionMode === 'auto');
            if (component.originIds.length === 0 && hasAutoEdges) {
                diagnostics.push({
                    type: 'missing-origin',
                    featureId: component.nodeIds[0],
                    message: 'Connected network component is missing an origin node.',
                });
                for (const edge of componentEdges) {
                    if (edge.directionMode === 'auto') edge.directionState = 'pending';
                }
                continue;
            }

            if (component.originIds.length > 1) {
                diagnostics.push({
                    type: 'multiple-origins',
                    featureId: component.originIds[0],
                    message: `Connected network component has multiple origins: ${component.originIds.join(', ')}.`,
                });
                for (const edge of componentEdges) {
                    if (edge.directionMode === 'auto') edge.directionState = 'conflict';
                }
                continue;
            }

            if (component.originIds.length !== 1) continue;

            const distances = computeDistances(component.originIds[0], new Map(componentEdges.map(edge => [edge.id, edge])));
            for (const edge of componentEdges) {
                if (edge.directionMode !== 'auto') continue;

                const fromDistance = distances.get(edge.from);
                const toDistance = distances.get(edge.to);

                if (fromDistance === undefined || toDistance === undefined) {
                    edge.directionState = 'pending';
                    continue;
                }

                if (fromDistance === toDistance) {
                    edge.directionState = 'pending';
                    diagnostics.push({
                        type: 'ambiguous-direction',
                        edgeId: edge.id,
                        message: `Network link ${edge.id} has equal topology distance on both endpoints and needs manual confirmation.`,
                    });
                    continue;
                }

                if (fromDistance > toDistance) {
                    const currentFrom = edge.from;
                    edge.from = edge.to;
                    edge.to = currentFrom;
                }
                edge.directionState = 'confirmed';
            }
        }

        return { nodes, edges: [...edgeMap.values()], diagnostics };
    },

    evaluate(featuresById: Record<string, FeatureState>, statusSnapshot: NetworkStatusSnapshot = {}): NetworkEvaluation {
        const graph = NetworkGraphService.build(featuresById);
        const outgoing = new Map<string, NetworkEdge[]>();
        const signalEdges = graph.edges.filter(edge => edge.kind === 'signal' && edge.directionState === 'confirmed');
        const componentByNode = new Map<string, ReturnType<typeof buildNetworkComponents>[number]>();
        const components = buildNetworkComponents(featuresById);

        for (const component of components) {
            for (const nodeId of component.nodeIds) {
                componentByNode.set(nodeId, component);
            }
        }

        for (const edge of signalEdges) {
            outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge]);
        }

        const reachable = new Set<string>();
        const queue: string[] = [];
        const sourceNodes = graph.nodes.filter(node => node.isOrigin);
        const fallbackSourceNodes = sourceNodes.length > 0
            ? sourceNodes
            : graph.nodes.filter(node => {
                const component = componentByNode.get(node.id);
                const componentHasAutoEdges = graph.edges.some(edge =>
                    component?.edgeIds.includes(edge.id) && edge.directionMode === 'auto'
                );
                return !componentHasAutoEdges && isSourceRole(node.role);
            });

        for (const source of fallbackSourceNodes) {
            if (getEntityStatus(source.id, source.telemetryId, statusSnapshot.nodes) === 'online') {
                reachable.add(source.id);
                queue.push(source.id);
            }
        }

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;

            for (const edge of outgoing.get(current) || []) {
                const edgeStatus = getEntityStatus(edge.id, edge.telemetryId, statusSnapshot.edges);
                if (edgeStatus !== 'online') continue;

                const target = graph.nodes.find(node => node.id === edge.to);
                if (!target) continue;

                const targetStatus = getEntityStatus(target.id, target.telemetryId, statusSnapshot.nodes);
                if (targetStatus !== 'online' || reachable.has(target.id)) continue;

                reachable.add(target.id);
                queue.push(target.id);
            }
        }

        const nodeStates: Record<string, NetworkNodeState> = {};

        for (const node of graph.nodes) {
            const directStatus = getEntityStatus(node.id, node.telemetryId, statusSnapshot.nodes);
            const affectedDownstream = collectDownstream(node.id, outgoing);
            const component = componentByNode.get(node.id);
            const componentDiagnostics = graph.diagnostics.filter(diagnostic =>
                (diagnostic.featureId && component?.nodeIds.includes(diagnostic.featureId)) ||
                (diagnostic.edgeId && component?.edgeIds.includes(diagnostic.edgeId))
            );
            const hasTopologyBlocker = componentDiagnostics.some(diagnostic =>
                diagnostic.type === 'missing-origin' || diagnostic.type === 'multiple-origins'
            );

            if (hasTopologyBlocker) {
                nodeStates[node.id] = {
                    nodeId: node.id,
                    status: 'configuration-error',
                    reason: componentDiagnostics[0]?.message || 'Network component has unresolved origin configuration.',
                    affectedDownstream,
                };
            } else if (directStatus === 'offline') {
                nodeStates[node.id] = {
                    nodeId: node.id,
                    status: 'direct-offline',
                    reason: 'Node telemetry reports offline.',
                    affectedDownstream,
                };
            } else if (directStatus === 'unknown') {
                nodeStates[node.id] = {
                    nodeId: node.id,
                    status: 'unknown',
                    reason: 'Node telemetry is unknown or unavailable.',
                    affectedDownstream,
                };
            } else if (reachable.has(node.id)) {
                nodeStates[node.id] = {
                    nodeId: node.id,
                    status: 'online',
                    reason: node.isOrigin
                        ? 'Node is the selected origin for this network component.'
                        : 'Node has an active path from the selected origin.',
                    affectedDownstream: [],
                };
            } else {
                nodeStates[node.id] = {
                    nodeId: node.id,
                    status: 'upstream-offline',
                    reason: 'No active confirmed path remains to the selected origin.',
                    affectedDownstream,
                };
            }
        }

        return { ...graph, nodeStates };
    },
};
