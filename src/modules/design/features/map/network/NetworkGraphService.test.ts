import { describe, expect, it } from 'vitest';
import type { FeatureState } from '@CONTRACT/types';
import { NetworkGraphService, type NetworkEntityStatus } from './NetworkGraphService';
import { createFeatureEndpointRef } from './NetworkEndpoint';

const node = (id: string, role: 'cabinet' | 'intersection' | 'device'): FeatureState => ({
    id,
    layer_id: 'layer',
    group_id: null,
    name: id,
    geom_type: 'Point',
    metadata: { network: { role, telemetry_id: `${id}-telemetry` } },
    properties: {},
    coordinates: [0, 0],
});

const originNode = (id: string, role: 'cabinet' | 'intersection' | 'device'): FeatureState => ({
    ...node(id, role),
    metadata: { network: { role, telemetry_id: `${id}-telemetry`, is_origin: true } },
});

const inferredNode = (id: string, metadata: Record<string, unknown> = {}): FeatureState => ({
    id,
    layer_id: 'layer',
    group_id: null,
    name: id,
    geom_type: 'Point',
    metadata,
    properties: {},
    coordinates: [0, 0],
});

const edge = (id: string, from?: string, to?: string): FeatureState => ({
    id,
    layer_id: 'layer',
    group_id: null,
    name: id,
    geom_type: 'LineString',
    metadata: {
        infrastructure: { type: 'SignalLine' },
        network: {
            from_feature_id: from,
            to_feature_id: to,
            ...(from ? { from_endpoint: createFeatureEndpointRef(from) } : {}),
            ...(to ? { to_endpoint: createFeatureEndpointRef(to) } : {}),
            telemetry_id: `${id}-telemetry`,
            direction_mode: 'auto',
        },
    },
    properties: {},
    coordinates: [[0, 0], [1, 1]],
});

const networkLink = (id: string, from?: string, to?: string): FeatureState => ({
    id,
    layer_id: 'layer',
    group_id: null,
    name: id,
    geom_type: 'NetworkLink',
    metadata: {
        infrastructure: { type: 'NetworkLink' },
        network: {
            from_feature_id: from,
            to_feature_id: to,
            ...(from ? { from_endpoint: createFeatureEndpointRef(from) } : {}),
            ...(to ? { to_endpoint: createFeatureEndpointRef(to) } : {}),
            telemetry_id: `${id}-telemetry`,
        },
    },
    properties: {},
    coordinates: null,
});

const byId = (...features: FeatureState[]): Record<string, FeatureState> =>
    Object.fromEntries(features.map(feature => [feature.id, feature]));

const allOnline = (ids: string[]): Record<string, NetworkEntityStatus> =>
    Object.fromEntries(ids.map(id => [`${id}-telemetry`, 'online' as const]));

describe('NetworkGraphService.build', () => {
    it('normalizes valid network nodes and SignalLine edges', () => {
        const graph = NetworkGraphService.build(byId(originNode('cabinet', 'cabinet'), node('a', 'device'), edge('line-a', 'cabinet', 'a')));

        expect(graph.nodes.map(item => item.id)).toEqual(['cabinet', 'a']);
        expect(graph.edges).toMatchObject([{ id: 'line-a', from: 'cabinet', to: 'a', kind: 'signal', sourceType: 'map-polyline', directionState: 'confirmed' }]);
        expect(graph.diagnostics).toEqual([]);
    });

    it('includes non-line features without network roles and excludes ordinary lines', () => {
        const graph = NetworkGraphService.build(byId(
            inferredNode('Nút giao A', { icon: 'intersection' }),
            inferredNode('camera-a', { parent_feature_id: 'Nút giao A', icon: 'cctv' }),
            { ...inferredNode('ordinary-line'), geom_type: 'LineString', coordinates: [[0, 0], [1, 1]] },
        ));

        expect(graph.nodes.map(item => item.id)).toEqual(['Nút giao A', 'camera-a']);
        expect(graph.nodes.find(item => item.id === 'Nút giao A')).toMatchObject({ role: 'intersection', isInferredRole: true });
        expect(graph.nodes.find(item => item.id === 'camera-a')).toMatchObject({ role: 'device', parentFeatureId: 'Nút giao A' });
        expect(graph.edges).toEqual([]);
        expect(graph.diagnostics).toEqual([]);
    });

    it('treats simulated NetworkLink features as edges without creating map polylines', () => {
        const graph = NetworkGraphService.build(byId(
            originNode('cabinet', 'cabinet'),
            node('camera-a', 'device'),
            networkLink('link-a', 'cabinet', 'camera-a'),
        ));

        expect(graph.nodes.map(item => item.id)).toEqual(['cabinet', 'camera-a']);
        expect(graph.edges).toMatchObject([{ id: 'link-a', from: 'cabinet', to: 'camera-a', kind: 'signal', sourceType: 'network-drawn' }]);
        expect(graph.edges[0].feature?.geom_type).toBe('NetworkLink');
        expect(graph.edges[0].feature?.coordinates).toBeNull();
        expect(graph.diagnostics).toEqual([]);
    });

    it('prefers a real SignalLine over a duplicate NetworkLink for the same direction', () => {
        const graph = NetworkGraphService.build(byId(
            originNode('cabinet', 'cabinet'),
            node('camera-a', 'device'),
            networkLink('draft-link', 'cabinet', 'camera-a'),
            edge('map-line', 'cabinet', 'camera-a'),
        ));

        expect(graph.edges).toHaveLength(1);
        expect(graph.edges[0]).toMatchObject({
            id: 'map-line',
            sourceType: 'map-polyline',
            from: 'cabinet',
            to: 'camera-a',
        });
        expect(graph.diagnostics).toContainEqual(expect.objectContaining({
            type: 'duplicate-edge',
            edgeId: 'draft-link',
        }));
    });

    it('reads shared-point endpoints while still resolving a representative feature node', () => {
        const graph = NetworkGraphService.build(byId(
            originNode('cabinet', 'cabinet'),
            {
                ...node('camera-a', 'device'),
                metadata: { parent_feature_id: 'cabinet' },
                coordinates: [105.001, 21.001],
            },
            {
                ...node('camera-b', 'device'),
                metadata: { parent_feature_id: 'cabinet' },
                coordinates: [105.001004, 21.001],
            },
            {
                ...edge('shared-line'),
                metadata: {
                    infrastructure: { type: 'SignalLine' },
                    network: {
                        from_feature_id: 'cabinet',
                        to_feature_id: 'camera-a',
                        from_endpoint: createFeatureEndpointRef('cabinet'),
                        to_endpoint: {
                            type: 'shared-point',
                            id: 'intersection:cabinet:distance:camera-a',
                            intersection_id: 'cabinet',
                            member_ids: ['camera-a', 'camera-b'],
                            coordinate: [105.001002, 21.001],
                        },
                        direction_mode: 'auto',
                    },
                },
            },
        ));

        expect(graph.edges[0]).toMatchObject({
            from: 'cabinet',
            to: 'camera-a',
            toEndpoint: {
                type: 'shared-point',
                id: 'intersection:cabinet:distance:camera-a',
            },
        });
    });

    it('reports dangling endpoints, self-loops, unknown nodes and duplicate edges', () => {
        const graph = NetworkGraphService.build(byId(
            node('a', 'device'),
            node('b', 'device'),
            edge('missing', 'a'),
            edge('self', 'a', 'a'),
            edge('unknown', 'a', 'ghost'),
            edge('first', 'a', 'b'),
            edge('duplicate', 'a', 'b'),
        ));

        expect(graph.edges.map(item => item.id)).toEqual(['first']);
        expect(graph.diagnostics.map(item => item.type)).toEqual([
            'missing-endpoint',
            'self-loop',
            'unknown-node',
            'duplicate-edge',
            'missing-origin',
        ]);
    });

    it('marks auto edges pending when a component has no origin', () => {
        const graph = NetworkGraphService.build(byId(
            node('a', 'intersection'),
            node('b', 'device'),
            edge('line-a', 'a', 'b'),
        ));

        expect(graph.edges[0]).toMatchObject({ directionState: 'pending' });
        expect(graph.diagnostics.map(item => item.type)).toContain('missing-origin');
    });

    it('marks auto edges as conflict when a component has multiple origins', () => {
        const graph = NetworkGraphService.build(byId(
            originNode('a', 'intersection'),
            originNode('b', 'cabinet'),
            edge('line-a', 'a', 'b'),
        ));

        expect(graph.edges[0]).toMatchObject({ directionState: 'conflict' });
        expect(graph.diagnostics.map(item => item.type)).toContain('multiple-origins');
    });

    it('infers a network edge from a legacy line snapped into an existing SignalLine', () => {
        const graph = NetworkGraphService.build(byId(
            {
                ...originNode('cabinet', 'cabinet'),
                coordinates: [0, 0],
            },
            {
                ...node('branch-a', 'device'),
                coordinates: [10, 0],
            },
            {
                ...node('branch-b', 'device'),
                coordinates: [1, 1],
            },
            {
                ...edge('main-line', 'cabinet', 'branch-a'),
                coordinates: [[0, 0], [10, 0]],
            },
            {
                id: 'legacy-branch',
                layer_id: 'layer',
                group_id: null,
                name: 'Legacy branch',
                geom_type: 'LineString',
                metadata: {
                    start_node_id: 'main-line',
                    end_node_id: 'branch-b',
                },
                properties: {},
                coordinates: [[0.2, 0.1], [1, 1]],
            },
        ));

        expect(graph.edges.map(item => item.id)).toContain('legacy-branch');
        expect(graph.edges.find(item => item.id === 'legacy-branch')).toMatchObject({
            from: 'cabinet',
            to: 'branch-b',
            sourceType: 'map-polyline',
        });
    });
});

describe('NetworkGraphService.evaluate', () => {
    it('propagates online status through chains and branches', () => {
        const evaluation = NetworkGraphService.evaluate(
            byId(
                originNode('cabinet', 'cabinet'),
                node('a', 'device'),
                node('b', 'device'),
                node('c', 'device'),
                edge('line-a', 'cabinet', 'a'),
                edge('line-b', 'a', 'b'),
                edge('line-c', 'a', 'c'),
            ),
            {
                nodes: allOnline(['cabinet', 'a', 'b', 'c']),
                edges: allOnline(['line-a', 'line-b', 'line-c']),
            },
        );

        expect(evaluation.nodeStates.b.status).toBe('online');
        expect(evaluation.nodeStates.c.status).toBe('online');
    });

    it('keeps a downstream node online when a redundant path remains active', () => {
        const evaluation = NetworkGraphService.evaluate(
            byId(
                originNode('cabinet-a', 'cabinet'),
                node('relay', 'device'),
                node('backup', 'device'),
                node('target', 'device'),
                edge('line-a', 'cabinet-a', 'relay'),
                edge('line-b', 'relay', 'target'),
                edge('line-c', 'cabinet-a', 'backup'),
                edge('line-d', 'backup', 'target'),
            ),
            {
                nodes: allOnline(['cabinet-a', 'relay', 'backup', 'target']),
                edges: {
                    'line-a-telemetry': 'offline',
                    'line-b-telemetry': 'offline',
                    'line-c-telemetry': 'online',
                    'line-d-telemetry': 'online',
                },
            },
        );

        expect(evaluation.nodeStates.target.status).toBe('online');
    });

    it('handles cycles without revisiting forever', () => {
        const evaluation = NetworkGraphService.evaluate(
            byId(
                originNode('cabinet', 'cabinet'),
                node('a', 'device'),
                node('b', 'device'),
                edge('line-a', 'cabinet', 'a'),
                edge('line-b', 'a', 'b'),
                edge('line-cycle', 'b', 'a'),
            ),
            {
                nodes: allOnline(['cabinet', 'a', 'b']),
                edges: allOnline(['line-a', 'line-b', 'line-cycle']),
            },
        );

        expect(evaluation.nodeStates.b.status).toBe('online');
    });

    it('marks only directly offline nodes as direct-offline and descendants as upstream-offline when no path remains', () => {
        const evaluation = NetworkGraphService.evaluate(
            byId(
                originNode('cabinet', 'cabinet'),
                node('a', 'device'),
                node('b', 'device'),
                edge('line-a', 'cabinet', 'a'),
                edge('line-b', 'a', 'b'),
            ),
            {
                nodes: { ...allOnline(['cabinet', 'b']), 'a-telemetry': 'offline' },
                edges: allOnline(['line-a', 'line-b']),
            },
        );

        expect(evaluation.nodeStates.a.status).toBe('direct-offline');
        expect(evaluation.nodeStates.b.status).toBe('upstream-offline');
        expect(evaluation.nodeStates.a.affectedDownstream).toEqual(['a', 'b']);
    });

    it('uses the selected origin as the topology source', () => {
        const evaluation = NetworkGraphService.evaluate(
            byId(originNode('a', 'intersection'), node('b', 'device'), edge('line-a', 'a', 'b')),
            { nodes: allOnline(['a', 'b']), edges: allOnline(['line-a']) },
        );

        expect(evaluation.nodeStates.a.status).toBe('online');
        expect(evaluation.nodeStates.b.status).toBe('online');
    });

    it('flags nodes as configuration-error when auto edges have no origin', () => {
        const evaluation = NetworkGraphService.evaluate(
            byId(node('a', 'intersection'), node('b', 'device'), edge('line-a', 'a', 'b')),
            { nodes: allOnline(['a', 'b']), edges: allOnline(['line-a']) },
        );

        expect(evaluation.nodeStates.a.status).toBe('configuration-error');
        expect(evaluation.nodeStates.b.status).toBe('configuration-error');
    });

    it('marks equal-depth auto edges as ambiguous and keeps them out of downstream propagation', () => {
        const evaluation = NetworkGraphService.evaluate(
            byId(
                originNode('root', 'intersection'),
                node('left', 'device'),
                node('right', 'device'),
                edge('line-left', 'root', 'left'),
                edge('line-right', 'root', 'right'),
                edge('line-cross', 'left', 'right'),
            ),
            { nodes: allOnline(['root', 'left', 'right']), edges: allOnline(['line-left', 'line-right', 'line-cross']) },
        );

        expect(evaluation.edges.find(edgeItem => edgeItem.id === 'line-cross')).toMatchObject({ directionState: 'pending' });
        expect(evaluation.diagnostics.map(item => item.type)).toContain('ambiguous-direction');
    });
});
