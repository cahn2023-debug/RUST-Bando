import { describe, expect, it } from 'vitest';
import type { FeatureState } from '@CONTRACT/types';
import { buildFeatureThemeUpdateEvent } from './ThemeModal';

const feature = (geomType: string): FeatureState => ({
  id: `${geomType}-1`,
  layer_id: 'layer-1',
  group_id: 'group-1',
  name: `${geomType} feature`,
  geom_type: geomType,
  metadata: {},
  properties: {},
  coordinates: geomType === 'Point' ? [106.1, 10.1] : [[106.1, 10.1], [106.2, 10.2]],
});

describe('buildFeatureThemeUpdateEvent', () => {
  it('does not write fiber metadata to point features', () => {
    const event = buildFeatureThemeUpdateEvent({
      feature: feature('Point'),
      groupName: 'Group',
      iconType: 'default',
      color: '#3B82F6',
      size: 12,
      fiberTheme: {
        declareFiber: true,
        lineStyle: 'dashed',
        cableType: 'ADSS-24F',
        coreCount: 24,
        owner: 'Ops',
        status: 'active',
      },
    });

    const metadata = JSON.parse(event.payload.metadata as string);
    expect(metadata.infrastructure).toBeUndefined();
    expect(metadata.fiber).toBeUndefined();
  });

  it('writes fiber declaration and line style to line features', () => {
    const event = buildFeatureThemeUpdateEvent({
      feature: feature('LineString'),
      groupName: 'Group',
      iconType: 'default',
      color: '#10B981',
      size: 8,
      fiberTheme: {
        declareFiber: true,
        lineStyle: 'dashed',
        cableType: 'ADSS-24F',
        coreCount: 24,
        owner: 'Ops',
        status: 'active',
      },
    });

    const metadata = JSON.parse(event.payload.metadata as string);
    expect(metadata.gis).toEqual(expect.objectContaining({
      color: '#10B981',
      size: 8,
      weight: 8,
      stroke: 8,
      dashArray: '6 4',
    }));
    expect(metadata.infrastructure).toEqual(expect.objectContaining({
      type: 'SignalLine',
      icon_type: 'fiber',
      line_style: 'dashed',
      cable_type: 'ADSS-24F',
      core_count: 24,
      owner: 'Ops',
      status: 'active',
    }));
    expect(metadata.fiber).toEqual(expect.objectContaining({ role: 'cable' }));
  });
});
