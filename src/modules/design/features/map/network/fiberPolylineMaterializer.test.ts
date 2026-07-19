import { describe, expect, it } from 'vitest';
import type { FeatureState } from '@CONTRACT/types';
import { buildFiberPolylineMaterializationEvents } from './fiberPolylineMaterializer';

const lineFeature = (id: string, coordinates: [number, number][]): FeatureState => ({
  id,
  layer_id: 'layer-1',
  group_id: null,
  name: id,
  geom_type: 'LineString',
  metadata: JSON.stringify({
    infrastructure: {
      type: 'SignalLine',
      core_count: 24,
      cable_type: '24F',
    },
  }),
  properties: {},
  coordinates,
});

describe('fiberPolylineMaterializer', () => {
  it('materializes endpoints and cable point rows for a polyline', () => {
    const result = buildFiberPolylineMaterializationEvents('project-1', {
      'line-1': lineFeature('line-1', [[106.1, 10.1], [106.2, 10.2], [106.3, 10.3]]),
    });

    expect(result.cableCount).toBe(1);
    expect(result.pointCount).toBe(2);
    expect(result.enclosureCount).toBe(0);
    expect(result.events.map(event => event.type)).toEqual([
      'FeatureCreated',
      'FeatureCreated',
      'FeatureUpdated',
      'FiberCableUpserted',
      'FiberCablePointsMaterialized',
    ]);

    const pointsEvent = result.events[result.events.length - 1];
    expect(pointsEvent?.type).toBe('FiberCablePointsMaterialized');
    if (pointsEvent?.type === 'FiberCablePointsMaterialized') {
      expect(pointsEvent.payload.points).toHaveLength(2);
      expect(pointsEvent.payload.points[0].point_kind).toBe('cable_start');
      expect(pointsEvent.payload.points[1].point_kind).toBe('cable_end');
    }
  });

  it('materializes a splice enclosure at a shared branch coordinate', () => {
    const result = buildFiberPolylineMaterializationEvents('project-1', {
      'line-1': lineFeature('line-1', [[106.1, 10.1], [106.2, 10.2], [106.3, 10.3]]),
      'line-2': lineFeature('line-2', [[106.3, 10.3], [106.4, 10.4]]),
    });

    const pointCreatedEvents = result.events.filter(event => event.type === 'FeatureCreated');
    expect(pointCreatedEvents.length).toBeGreaterThanOrEqual(3);
    expect(result.enclosureCount).toBeGreaterThanOrEqual(1);

    const pointsEvent = result.events.filter(event => event.type === 'FiberCablePointsMaterialized');
    expect(pointsEvent).toHaveLength(2);
    const firstCablePoints = pointsEvent[0];
    if (firstCablePoints.type === 'FiberCablePointsMaterialized') {
      expect(firstCablePoints.payload.points.some(point => point.point_kind === 'splice_enclosure')).toBe(true);
    }
  });
});
