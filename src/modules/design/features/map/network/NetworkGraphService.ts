import type { FeatureMetadata, FeatureState } from '@CONTRACT/types';

export type NetworkRole = 'cabinet' | 'intersection' | 'device';
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
}

export interface NetworkDiagnostic {
    type: 'missing-endpoint' | 'self-loop' | 'unknown-node' | 'duplicate-edge' | 'missing-cabinet';
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

const isNetworkRole = (role: unknown): role is NetworkRole =>
    role === 'cabinet' || role === 'intersection' || role === 'device';

const normalizeText = (value: unknown): string =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

const isLineFeature = (feature: FeatureState): boolean => {
    const geomType = (feature.geom_type || feature.geometry_type || '').toLowerCase();
    return geomType.includes('line');
};

const isNetworkEdgeFeature = (feature: FeatureState, metadata: FeatureMetadata): boolean => {
    const geomType = (feature.geom_type || feature.geometry_type || '').toLowerCase();
    return (geomType.includes('line') && metadata.infrastructure?.type === 'SignalLine') ||
        metadata.infrastructure?.type === 'NetworkLink';
};

const inferNetworkRole = (feature: FeatureState, metadata: FeatureMetadata): NetworkRole => {
    const explicitRole = metadata.network?.role;
    if (isNetworkRole(explicitRole)) return explicitRole;

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

export const NetworkGraphService = {
    build(featuresById: Record<string, FeatureState>): NetworkGraph {
        const nodes: NetworkNode[] = [];
        const edges: NetworkEdge[] = [];
        const diagnostics: NetworkDiagnostic[] = [];
        const nodeIds = new Set<string>();
        const edgePairs = new Map<string, string>();

        for (const feature of Object.values(featuresById)) {
            const metadata = parseMetadata(feature.metadata);
            if (isLineFeature(feature) || isNetworkEdgeFeature(feature, metadata)) continue;

            const explicitRole = metadata.network?.role;
            const role = inferNetworkRole(feature, metadata);

            nodeIds.add(feature.id);
            nodes.push({
                id: feature.id,
                label: feature.name || feature.id,
                role,
                networkRole: role,
                isInferredRole: !isNetworkRole(explicitRole),
                telemetryId: metadata.network?.telemetry_id,
                parentFeatureId: typeof metadata.parent_feature_id === 'string' ? metadata.parent_feature_id : undefined,
                feature,
            });
        }

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
                diagnostics.push({
                    type: 'duplicate-edge',
                    edgeId: feature.id,
                message: `Network link ${feature.id} duplicates ${previousEdgeId}.`,
                });
                continue;
            }

            edgePairs.set(pairKey, feature.id);
            edges.push({
                id: feature.id,
                label: feature.name || feature.id,
                from,
                to,
                kind: 'signal',
                telemetryId: metadata.network?.telemetry_id,
                feature,
            });
        }

        if (!nodes.some(node => node.role === 'cabinet' || node.role === 'intersection')) {
            diagnostics.push({
                type: 'missing-cabinet',
                message: 'Network graph has no cabinet or intersection source node.',
            });
        }

        return { nodes, edges, diagnostics };
    },

    evaluate(featuresById: Record<string, FeatureState>, statusSnapshot: NetworkStatusSnapshot = {}): NetworkEvaluation {
        const graph = NetworkGraphService.build(featuresById);
        const outgoing = new Map<string, NetworkEdge[]>();
        const signalEdges = graph.edges.filter(edge => edge.kind === 'signal');

        for (const edge of signalEdges) {
            outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge]);
        }

        const reachable = new Set<string>();
        const queue: string[] = [];
        const cabinetNodes = graph.nodes.filter(node => node.role === 'cabinet');
        const sourceNodes = cabinetNodes.length > 0 ? cabinetNodes : graph.nodes.filter(node => node.role === 'intersection');

        for (const cabinet of sourceNodes) {
            if (getEntityStatus(cabinet.id, cabinet.telemetryId, statusSnapshot.nodes) === 'online') {
                reachable.add(cabinet.id);
                queue.push(cabinet.id);
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

        const hasConfigurationError = graph.diagnostics.some(diagnostic => diagnostic.type === 'missing-cabinet');
        const nodeStates: Record<string, NetworkNodeState> = {};

        for (const node of graph.nodes) {
            const directStatus = getEntityStatus(node.id, node.telemetryId, statusSnapshot.nodes);
            const affectedDownstream = collectDownstream(node.id, outgoing);

            if (hasConfigurationError) {
                nodeStates[node.id] = {
                    nodeId: node.id,
                    status: 'configuration-error',
                    reason: 'No cabinet source is configured for this graph.',
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
                    reason: 'Node has an active path to an online cabinet.',
                    affectedDownstream: [],
                };
            } else {
                nodeStates[node.id] = {
                    nodeId: node.id,
                    status: 'upstream-offline',
                    reason: 'No active path remains to any online cabinet.',
                    affectedDownstream,
                };
            }
        }

        return { ...graph, nodeStates };
    },
};
