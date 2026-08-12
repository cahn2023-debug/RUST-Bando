import { describe, expect, it } from 'vitest';
import type { FeatureState } from '@CONTRACT/types';
import { FeatureRenderStore } from './FeatureRenderStore';

const pointFeature = (id: string, lng = 105.8, color = '#ef4444'): FeatureState => ({
    id,
    layer_id: 'layer-1',
    group_id: 'group-1',
    name: id,
    geom_type: 'point',
    metadata: { color },
    properties: {},
    coordinates: [lng, 21.02] as any,
    bbox: { min_x: lng, min_y: 21.02, max_x: lng, max_y: 21.02 },
});

describe('FeatureRenderStore', () => {
    it('emits added, geometry, style, state, and deleted changes', () => {
        const store = new FeatureRenderStore();

        expect(store.applySnapshot([pointFeature('point-1')]).added.map(feature => feature.id)).toEqual(['point-1']);
        expect(store.applySnapshot([pointFeature('point-1', 106)]).updatedGeometry.map(feature => feature.id)).toEqual(['point-1']);
        expect(store.applySnapshot([pointFeature('point-1', 106, '#22c55e')]).updatedStyle.map(change => change.id)).toEqual(['point-1']);
        expect(store.updateState([{ id: 'point-1', selected: true }]).updatedState).toEqual([{ id: 'point-1', selected: true }]);
        expect(store.applySnapshot([]).deletedIds).toEqual(['point-1']);
    });
});

