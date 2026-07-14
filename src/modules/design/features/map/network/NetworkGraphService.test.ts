import { describe, expect, it } from 'vitest';
import type { FeatureState } from '@CONTRACT/types';
import { NetworkGraphService, type NetworkEntityStatus } from './NetworkGraphService';

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
        network: { from_feature_id: from, to_feature_id: to, telemetry_id: `${id}-telemetry` },
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
        network: { from_feature_id: from, to_feature_id: to, telemetry_id: `${id}-telemetry` },
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
        const graph = NetworkGraphService.build(byId(node('cabinet', 'cabinet'), node('a', 'device'), edge('line-a', 'cabinet', 'a')));

        expect(graph.nodes.map(item => item.id)).toEqual(['cabinet', 'a']);
        expect(graph.edges).toMatchObject([{ id: 'line-a', from: 'cabinet', to: 'a', kind: 'signal' }]);
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
            node('cabinet', 'cabinet'),
            node('camera-a', 'device'),
            networkLink('link-a', 'cabinet', 'camera-a'),
        ));

        expect(graph.nodes.map(item => item.id)).toEqual(['cabinet', 'camera-a']);
        expect(graph.edges).toMatchObject([{ id: 'link-a', from: 'cabinet', to: 'camera-a', kind: 'signal' }]);
        expect(graph.edges[0].feature?.geom_type).toBe('NetworkLink');
        expect(graph.edges[0].feature?.coordinates).toBeNull();
        expect(graph.diagnostics).toEqual([]);
    });

    it('reports dangling endpoints, self-loops, unknown nodes, duplicate edges and missing cabinets', () => {
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
            'missing-cabinet',
        ]);
    });
});

describe('NetworkGraphService.evaluate', () => {
    it('propagates online status through chains and branches', () => {
        const evaluation = NetworkGraphService.evaluate(
            byId(
                node('cabinet', 'cabinet'),
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
                node('cabinet-a', 'cabinet'),
                node('cabinet-b', 'cabinet'),
                node('target', 'device'),
                edge('line-a', 'cabinet-a', 'target'),
                edge('line-b', 'cabinet-b', 'target'),
            ),
            {
                nodes: allOnline(['cabinet-a', 'cabinet-b', 'target']),
                edges: { 'line-a-telemetry': 'offline', 'line-b-telemetry': 'online' },
            },
        );

        expect(evaluation.nodeStates.target.status).toBe('online');
    });

    it('handles cycles without revisiting forever', () => {
        const evaluation = NetworkGraphService.evaluate(
            byId(
                node('cabinet', 'cabinet'),
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
                node('cabinet', 'cabinet'),
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

    it('uses intersections as source nodes when no explicit cabinet exists', () => {
        const evaluation = NetworkGraphService.evaluate(
            byId(node('a', 'intersection'), node('b', 'device'), edge('line-a', 'a', 'b')),
            { nodes: allOnline(['a', 'b']), edges: allOnline(['line-a']) },
        );

        expect(evaluation.nodeStates.a.status).toBe('online');
        expect(evaluation.nodeStates.b.status).toBe('online');
    });
});
