import { describe, expect, it } from 'vitest';
import type { FeatureState, FiberInventory } from '@CONTRACT/types';
import { validateFiberGeometry } from './fiberGeometryValidation';

const lineFeature = (id: string, metadata: FeatureState['metadata']): FeatureState => ({
  id,
  layer_id: 'layer-1',
  group_id: null,
  name: id,
  geom_type: 'LineString',
  metadata,
  properties: {},
  coordinates: [[106.1, 10.1], [106.2, 10.2]],
});

const emptyInventory: FiberInventory = {
  project_id: 'project-1',
  scope: {},
  cables: [],
  strands: [],
  ports: [],
  splices: [],
  circuits: [],
  cable_points: [],
  equipment: [],
  summary: {
    total_strands: 0,
    available_strands: 0,
    reserved_strands: 0,
    active_strands: 0,
    damaged_strands: 0,
    free_strands: 0,
  },
};

describe('fiberGeometryValidation', () => {
  it('does not validate ordinary polylines as fiber lines', () => {
    const diagnostics = validateFiberGeometry('project-1', emptyInventory, {
      'line-1': lineFeature('line-1', {}),
    });

    expect(diagnostics.some(item => item.type === 'missing-polyline-endpoint')).toBe(false);
  });

  it('reports missing endpoints for SignalLine fiber lines', () => {
    const diagnostics = validateFiberGeometry('project-1', emptyInventory, {
      'line-1': lineFeature('line-1', { infrastructure: { type: 'SignalLine' } }),
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        type: 'missing-polyline-endpoint',
        feature_id: 'line-1',
      }),
    ]);
  });
});
