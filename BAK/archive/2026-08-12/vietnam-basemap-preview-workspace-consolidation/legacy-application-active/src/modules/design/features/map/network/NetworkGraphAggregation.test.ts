import { describe, expect, it } from 'vitest';
import type { FeatureState } from '@CONTRACT/types';
import type { NetworkEdge, NetworkNode } from './NetworkGraphService';
import { buildDisplayNetworkGraph } from './NetworkGraphAggregation';
import { createFeatureEndpointRef, getNetworkEndpointKey } from './NetworkEndpoint';

const pointFeature = (id: string, metadata: Record<string, unknown>, coordinates: [number, number]): FeatureState => ({
    id,
    layer_id: 'layer',
    group_id: 'group',
    name: id,
    geom_type: 'Point',
    metadata,
    properties: {},
    coordinates,
});

const networkNode = (
    id: string,
    role: 'cabinet' | 'intersection' | 'device',
    metadata: Record<string, unknown>,
    coordinates: [number, number]
): NetworkNode => ({
    id,
    label: id,
    role,
    networkRole: role,
    isInferredRole: false,
    telemetryId: `${id}-telemetry`,
    parentFeatureId: typeof metadata.parent_feature_id === 'string' ? metadata.parent_feature_id : undefined,
    isOrigin: role === 'cabinet',
    feature: pointFeature(id, metadata, coordinates),
});

const networkEdge = (id: string, from: string, to: string, metadata: Record<string, unknown> = {}): NetworkEdge => ({
    id,
    label: id,
    from,
    to,
    kind: 'signal',
    sourceType: 'map-polyline',
    telemetryId: `${id}-telemetry`,
    directionMode: 'manual',
    directionState: 'confirmed',
    fromEndpoint: createFeatureEndpointRef(from),
    toEndpoint: createFeatureEndpointRef(to),
    fromEndpointKey: getNetworkEndpointKey(createFeatureEndpointRef(from)),
    toEndpointKey: getNetworkEndpointKey(createFeatureEndpointRef(to)),
    feature: {
        id,
        layer_id: 'layer',
        group_id: 'group',
        name: id,
        geom_type: 'LineString',
        metadata,
        properties: {},
        coordinates: [[105, 21], [105.001, 21.001]],
    },
});

describe('buildDisplayNetworkGraph', () => {
    it('collapses devices that share a point within 0.6 meters inside an intersection', () => {
        const cabinet = networkNode('cabinet-1', 'cabinet', { network: { role: 'cabinet' } }, [105, 21]);
        const cameraA = networkNode('camera-a', 'device', { parent_feature_id: 'cabinet-1' }, [105.001, 21.001]);
        const cameraB = networkNode('camera-b', 'device', { parent_feature_id: 'cabinet-1' }, [105.001004, 21.001]);

        const result = buildDisplayNetworkGraph(
            [cabinet, cameraA, cameraB],
            [
                networkEdge('line-a', 'cabinet-1', 'camera-a'),
                networkEdge('line-b', 'cabinet-1', 'camera-b'),
            ],
            'cabinet-1'
        );

        expect(result.nodes).toHaveLength(2);
        const groupedDevice = result.nodes.find(node => node.memberCount === 2);
        expect(groupedDevice).toBeDefined();
        expect(groupedDevice?.memberIds).toEqual(['camera-a', 'camera-b']);
        expect(groupedDevice?.endpointRef).toMatchObject({
            type: 'shared-point',
            intersection_id: 'cabinet-1',
            member_ids: ['camera-a', 'camera-b'],
        });
        expect(result.displayNodeIdByRawNodeId['camera-a']).toBe(result.displayNodeIdByRawNodeId['camera-b']);
        expect(result.edges).toHaveLength(1);
        expect(result.edges[0]).toMatchObject({
            from: 'cabinet-1',
            to: groupedDevice?.id,
        });
        expect(result.edges[0].memberEdgeIds).toEqual(['line-a', 'line-b']);
    });

    it('keeps devices separate when they are at least 0.6 meters apart', () => {
        const cabinet = networkNode('cabinet-1', 'cabinet', { network: { role: 'cabinet' } }, [105, 21]);
        const cameraA = networkNode('camera-a', 'device', { parent_feature_id: 'cabinet-1' }, [105.001, 21.001]);
        const cameraB = networkNode('camera-b', 'device', { parent_feature_id: 'cabinet-1' }, [105.001007, 21.001]);

        const result = buildDisplayNetworkGraph(
            [cabinet, cameraA, cameraB],
            [
                networkEdge('line-a', 'cabinet-1', 'camera-a'),
                networkEdge('line-b', 'cabinet-1', 'camera-b'),
            ],
            'cabinet-1'
        );

        expect(result.nodes).toHaveLength(3);
        expect(result.edges).toHaveLength(2);
    });
});
