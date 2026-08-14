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
  it('does not auto-create cable start/end points for a polyline', () => {
    const result = buildFiberPolylineMaterializationEvents('project-1', {
      'line-1': lineFeature('line-1', [[106.1, 10.1], [106.2, 10.2], [106.3, 10.3]]),
    });

    expect(result.cableCount).toBe(1);
    expect(result.pointCount).toBe(0);
    expect(result.enclosureCount).toBe(0);
    expect(result.events.map(event => event.type)).toEqual([
      'FeatureUpdated',
      'FiberCableUpserted',
    ]);

    const updateEvent = result.events[0];
    expect(updateEvent?.type).toBe('FeatureUpdated');
    if (updateEvent?.type === 'FeatureUpdated') {
      const metadata = JSON.parse(updateEvent.payload.metadata as string);
      expect(metadata.gis).toEqual(expect.objectContaining({
        color: '#0088ff',
        size: 6,
        weight: 6,
        stroke: 6,
      }));
      expect(metadata.infrastructure).toEqual(expect.objectContaining({
        type: 'SignalLine',
        cable_type: '24F',
        core_count: 24,
      }));
      expect(metadata.network?.direction_mode).toBe('auto');
      expect(metadata.fiber?.role).toBe('cable');
      expect(metadata.network?.from_endpoint).toBeUndefined();
      expect(metadata.network?.to_endpoint).toBeUndefined();
    }
  });

  it('does not auto-create a splice enclosure at a shared branch coordinate', () => {
    const result = buildFiberPolylineMaterializationEvents('project-1', {
      'line-1': lineFeature('line-1', [[106.1, 10.1], [106.2, 10.2], [106.3, 10.3]]),
      'line-2': lineFeature('line-2', [[106.3, 10.3], [106.4, 10.4]]),
    });

    const pointCreatedEvents = result.events.filter(event => event.type === 'FeatureCreated');
    expect(pointCreatedEvents).toHaveLength(0);
    expect(result.pointCount).toBe(0);
    expect(result.enclosureCount).toBe(0);

    const pointsEvent = result.events.find(event => event.type === 'FiberCablePointsMaterialized');
    expect(pointsEvent).toBeUndefined();
  });

  it('materializes a splice enclosure only when a valid GIS point already exists', () => {
    const splicePoint: FeatureState = {
      id: 'splice-1',
      layer_id: 'layer-1',
      group_id: null,
      name: 'Măng xông 1',
      geom_type: 'Point',
      metadata: {
        fiber: {
          kind: 'splice_enclosure',
          point_kind: 'splice_enclosure',
        },
      },
      properties: {},
      coordinates: [106.3, 10.3],
    };
    const result = buildFiberPolylineMaterializationEvents('project-1', {
      'line-1': lineFeature('line-1', [[106.1, 10.1], [106.2, 10.2], [106.3, 10.3]]),
      'line-2': lineFeature('line-2', [[106.3, 10.3], [106.4, 10.4]]),
      'splice-1': splicePoint,
    });

    const pointCreatedEvents = result.events.filter(event => event.type === 'FeatureCreated');
    expect(pointCreatedEvents).toHaveLength(0);
    expect(result.pointCount).toBe(1);
    expect(result.enclosureCount).toBe(1);

    const pointsEvent = result.events.filter(event => event.type === 'FiberCablePointsMaterialized');
    expect(pointsEvent).toHaveLength(2);
    const firstCablePoints = pointsEvent[0];
    if (firstCablePoints.type === 'FiberCablePointsMaterialized') {
      expect(firstCablePoints.payload.points.some(point => point.point_kind === 'splice_enclosure')).toBe(true);
    }
  });

  it('does not reuse unrelated point features as fiber endpoints', () => {
    const normalPoint: FeatureState = {
      id: 'point-1',
      layer_id: 'layer-1',
      group_id: null,
      name: 'Plain point',
      geom_type: 'Point',
      metadata: {},
      properties: {},
      coordinates: [106.1, 10.1],
    };
    const result = buildFiberPolylineMaterializationEvents('project-1', {
      'line-1': lineFeature('line-1', [[106.1, 10.1], [106.2, 10.2]]),
      'point-1': normalPoint,
    });

    const pointsEvent = result.events.find(event => event.type === 'FiberCablePointsMaterialized');
    expect(pointsEvent).toBeUndefined();
  });

  it('does not store SignalLine as the cable type when cable_type is absent', () => {
    const result = buildFiberPolylineMaterializationEvents('project-1', {
      'line-1': {
        ...lineFeature('line-1', [[106.1, 10.1], [106.2, 10.2]]),
        metadata: JSON.stringify({
          infrastructure: {
            type: 'SignalLine',
            core_count: 24,
          },
        }),
      },
    });

    const cableEvent = result.events.find(event => event.type === 'FiberCableUpserted');
    expect(cableEvent?.type).toBe('FiberCableUpserted');
    if (cableEvent?.type === 'FiberCableUpserted') {
      expect(cableEvent.payload.cable_type).toBeNull();
    }
  });

  it('materializes legacy style fields into structured gis metadata', () => {
    const result = buildFiberPolylineMaterializationEvents('project-1', {
      'line-1': {
        ...lineFeature('line-1', [[106.1, 10.1], [106.2, 10.2]]),
        metadata: JSON.stringify({
          color: '#123456',
          size: 10,
          infrastructure: { type: 'SignalLine', core_count: 12, cable_type: 'ADSS-12F' },
        }),
      },
    });

    const updateEvent = result.events.find(event => event.type === 'FeatureUpdated');
    expect(updateEvent?.type).toBe('FeatureUpdated');
    if (updateEvent?.type === 'FeatureUpdated') {
      const metadata = JSON.parse(updateEvent.payload.metadata as string);
      expect(metadata.gis).toEqual(expect.objectContaining({
        color: '#123456',
        size: 10,
        weight: 10,
        stroke: 10,
      }));
      expect(metadata.color).toBe('#123456');
      expect(metadata.weight).toBe(10);
    }
  });

  it('prioritizes GIS size over stale GIS weight when materializing line style', () => {
    const result = buildFiberPolylineMaterializationEvents('project-1', {
      'line-1': {
        ...lineFeature('line-1', [[106.1, 10.1], [106.2, 10.2]]),
        metadata: JSON.stringify({
          gis: { color: '#123456', size: 12, weight: 4 },
          infrastructure: { type: 'SignalLine', core_count: 12, cable_type: 'ADSS-12F' },
        }),
      },
    });

    const updateEvent = result.events.find(event => event.type === 'FeatureUpdated');
    expect(updateEvent?.type).toBe('FeatureUpdated');
    if (updateEvent?.type === 'FeatureUpdated') {
      const metadata = JSON.parse(updateEvent.payload.metadata as string);
      expect(metadata.gis).toEqual(expect.objectContaining({
        size: 12,
        weight: 12,
        stroke: 12,
      }));
      expect(metadata.weight).toBe(12);
    }
  });

  it('supports coordinates serialized as JSON string', () => {
    const serializedLineFeature: FeatureState = {
      id: 'serialized-line',
      layer_id: 'layer-1',
      group_id: null,
      name: 'Serialized Line',
      geom_type: 'LineString',
      metadata: JSON.stringify({
        infrastructure: {
          type: 'SignalLine',
          core_count: 24,
          cable_type: '24F',
        },
      }),
      properties: {},
      coordinates: '[[106.1, 10.1], [106.2, 10.2]]' as any,
    };

    const result = buildFiberPolylineMaterializationEvents('project-1', {
      'serialized-line': serializedLineFeature,
    });

    expect(result.cableCount).toBe(1);
    expect(result.events).toHaveLength(2);
    expect(result.events[1].type).toBe('FiberCableUpserted');
  });
});
