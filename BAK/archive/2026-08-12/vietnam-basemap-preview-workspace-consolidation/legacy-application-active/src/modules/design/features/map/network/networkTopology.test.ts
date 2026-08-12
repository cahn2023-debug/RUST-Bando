import { describe, expect, it } from 'vitest';
import type { FeatureState } from '@CONTRACT/types';
import { buildToggleOriginEvents } from './networkTopology';

const node = (id: string, role: 'cabinet' | 'intersection' | 'device', isOrigin = false): FeatureState => ({
    id,
    layer_id: 'layer',
    group_id: 'group',
    name: id,
    geom_type: 'Point',
    coordinates: [0, 0],
    metadata: {
        network: { role, is_origin: isOrigin },
    },
    properties: {},
});

const edge = (id: string, from: string, to: string): FeatureState => ({
    id,
    layer_id: 'layer',
    group_id: 'group',
    name: id,
    geom_type: 'LineString',
    coordinates: [[0, 0], [1, 1]],
    metadata: {
        infrastructure: { type: 'SignalLine' },
        network: {
            from_feature_id: from,
            to_feature_id: to,
            from_endpoint: { type: 'feature', id: from },
            to_endpoint: { type: 'feature', id: to },
            direction_mode: 'auto',
        },
    },
    properties: {},
});

describe('buildToggleOriginEvents', () => {
    it('clears origin when toggling an existing origin node off', () => {
        const events = buildToggleOriginEvents({
            a: node('a', 'intersection', true),
            b: node('b', 'device'),
        }, 'a');

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            type: 'FeatureUpdated',
            payload: { id: 'a' },
        });
        expect(JSON.parse((events[0] as any).payload.metadata)).toMatchObject({
            network: { role: 'intersection' },
        });
    });

    it('sets the selected node as the only origin when toggling on', () => {
        const events = buildToggleOriginEvents({
            a: node('a', 'intersection'),
            b: node('b', 'device', true),
            line: edge('line', 'a', 'b'),
        }, 'a');

        expect(events).toHaveLength(2);
        expect(JSON.parse((events[0] as any).payload.metadata)).toMatchObject({
            network: { role: 'intersection', is_origin: true },
        });
        expect(JSON.parse((events[1] as any).payload.metadata)).toMatchObject({
            network: { role: 'device' },
        });
    });
});
