import { describe, expect, it } from 'vitest';
import type { FeatureState } from '@CONTRACT/types';
import type { DisplayNetworkNode } from './NetworkGraphAggregation';
import type { NetworkNode } from './NetworkGraphService';
import { prepareNetworkConnectionDraft } from './NetworkConnectionDraft';
import { createFeatureEndpointRef } from './NetworkEndpoint';

const feature = (id: string, groupId = 'group-1'): FeatureState => ({
    id,
    layer_id: 'layer-1',
    group_id: groupId,
    name: id,
    geom_type: 'Point',
    metadata: {},
    properties: {},
    coordinates: [105, 21],
});

const networkNode = (id: string, role: 'cabinet' | 'intersection' | 'device', groupId = 'group-1'): NetworkNode => ({
    id,
    label: id,
    role,
    networkRole: role,
    isInferredRole: false,
    telemetryId: `${id}-telemetry`,
    parentFeatureId: role === 'device' ? 'intersection-1' : undefined,
    isOrigin: role !== 'device',
    feature: feature(id, groupId),
});

const displayNode = (
    id: string,
    role: 'cabinet' | 'intersection' | 'device',
    overrides: Partial<DisplayNetworkNode> = {}
): DisplayNetworkNode => ({
    id,
    representative: networkNode(id, role),
    memberIds: [id],
    memberLabels: [id],
    memberCount: 1,
    groupId: 'group-1',
    ownerIntersectionId: role === 'device' ? 'intersection-1' : role === 'intersection' ? id : null,
    layerId: 'layer-1',
    endpointRef: createFeatureEndpointRef(id),
    endpointKey: `feature:${id}`,
    ...overrides,
});

describe('prepareNetworkConnectionDraft', () => {
    it('keeps route connections as raw feature endpoints', () => {
        const result = prepareNetworkConnectionDraft(
            displayNode('cabinet-1', 'cabinet'),
            displayNode('camera-1', 'device'),
            'route'
        );

        expect(result).toMatchObject({
            groupId: 'group-1',
            activeParentFeatureId: null,
            draft: {
                fromEndpoint: { type: 'feature', id: 'cabinet-1' },
                toEndpoint: { type: 'feature', id: 'camera-1' },
            },
        });
    });

    it('keeps intersection connections pinned to the shared-point endpoint', () => {
        const groupedDevice = displayNode('intersection:intersection-1:distance:camera-1', 'device', {
            memberIds: ['camera-1', 'camera-2'],
            memberLabels: ['Camera 1', 'Camera 2'],
            memberCount: 2,
            endpointRef: {
                type: 'shared-point',
                id: 'intersection:intersection-1:distance:camera-1',
                intersection_id: 'intersection-1',
                member_ids: ['camera-1', 'camera-2'],
                coordinate: [105.001002, 21.001],
            },
            endpointKey: 'shared-point:intersection:intersection-1:distance:camera-1',
        });

        const result = prepareNetworkConnectionDraft(
            displayNode('intersection-1', 'intersection'),
            groupedDevice,
            'intersection'
        );

        expect(result).toMatchObject({
            groupId: 'group-1',
            activeParentFeatureId: 'intersection-1',
            draft: {
                fromEndpoint: { type: 'feature', id: 'intersection-1' },
                toEndpoint: {
                    type: 'shared-point',
                    id: 'intersection:intersection-1:distance:camera-1',
                    intersection_id: 'intersection-1',
                },
            },
        });
    });
});
