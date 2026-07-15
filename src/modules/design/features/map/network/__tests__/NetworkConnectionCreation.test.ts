import { describe, expect, it } from 'vitest';
import type { FeatureGroupState, FeatureState } from '@CONTRACT/types';
import { createFeatureEndpointRef } from '../NetworkEndpoint';
import { buildNetworkConnectionCreateEvents } from '../NetworkConnectionCreation';

const feature = (id: string, role: 'cabinet' | 'intersection' | 'device'): FeatureState => ({
    id,
    layer_id: 'layer-1',
    group_id: 'group-1',
    name: id,
    geom_type: 'Point',
    coordinates: [0, 0],
    metadata: JSON.stringify({ network: { role } }),
    properties: {},
});

const group: FeatureGroupState = {
    id: 'group-1',
    layer_id: 'layer-1',
    name: 'Group 1',
    type: 'CAMERA',
};

const displayNode = (id: string, representative: FeatureState, groupId = 'group-1'): any => ({
    id,
    representative: {
        id: representative.id,
        label: representative.name,
        role: 'device',
        networkRole: 'device',
        isInferredRole: false,
        isOrigin: false,
        feature: representative,
    },
    memberIds: [representative.id],
    memberLabels: [representative.name],
    memberCount: 1,
    groupId,
    ownerIntersectionId: null,
    layerId: representative.layer_id,
    endpointRef: createFeatureEndpointRef(representative.id),
    endpointKey: `feature:${representative.id}`,
});

describe('buildNetworkConnectionCreateEvents', () => {
    it('creates a NetworkLink without map geometry when connecting in NETWORK', () => {
        const featuresById = {
            'cabinet-1': feature('cabinet-1', 'cabinet'),
            'camera-1': feature('camera-1', 'device'),
        };

        const result = buildNetworkConnectionCreateEvents({
            sourceNode: displayNode('cabinet-node', featuresById['cabinet-1']),
            targetNode: displayNode('camera-node', featuresById['camera-1']),
            draft: {
                fromEndpoint: createFeatureEndpointRef('cabinet-1'),
                toEndpoint: createFeatureEndpointRef('camera-1'),
            },
            group,
            selectedGroupId: 'group-1',
            activeParentFeatureId: null,
            featuresById,
            createId: () => 'network-link-1',
        });

        expect(result.events).toHaveLength(2);
        expect(result.events[0]).toMatchObject({
            type: 'FeatureUpdated',
            payload: {
                id: 'camera-1',
            },
        });
        expect(result.events[1]).toMatchObject({
            type: 'FeatureCreated',
            payload: {
                id: 'network-link-1',
                geom_type: 'NetworkLink',
                coordinates: null,
                layer_id: 'layer-1',
                group_id: 'group-1',
            },
        });
        expect(JSON.parse((result.events[1] as any).payload.metadata)).toMatchObject({
            infrastructure: { type: 'NetworkLink' },
            network: {
                from_feature_id: 'cabinet-1',
                to_feature_id: 'camera-1',
                from_endpoint: createFeatureEndpointRef('cabinet-1'),
                to_endpoint: createFeatureEndpointRef('camera-1'),
            },
        });
    });

    it('preserves shared-point endpoints in NetworkLink metadata', () => {
        const featuresById = {
            'cabinet-1': feature('cabinet-1', 'cabinet'),
            'camera-1': feature('camera-1', 'device'),
        };

        const result = buildNetworkConnectionCreateEvents({
            sourceNode: displayNode('cabinet-node', featuresById['cabinet-1']),
            targetNode: displayNode('camera-node', featuresById['camera-1']),
            draft: {
                fromEndpoint: createFeatureEndpointRef('cabinet-1'),
                toEndpoint: {
                    type: 'shared-point',
                    id: 'intersection:cabinet-1:distance:camera-1',
                    intersection_id: 'cabinet-1',
                    member_ids: ['camera-1'],
                    coordinate: [105.1, 21.1],
                },
            },
            group,
            selectedGroupId: 'group-1',
            activeParentFeatureId: null,
            featuresById,
            createId: () => 'network-link-2',
        });

        const created = result.events[result.events.length - 1] as any;
        expect(JSON.parse(created.payload.metadata)).toMatchObject({
            network: {
                from_feature_id: 'cabinet-1',
                to_feature_id: 'camera-1',
                to_endpoint: {
                    type: 'shared-point',
                    id: 'intersection:cabinet-1:distance:camera-1',
                    intersection_id: 'cabinet-1',
                    member_ids: ['camera-1'],
                    coordinate: [105.1, 21.1],
                },
            },
        });
    });
});
