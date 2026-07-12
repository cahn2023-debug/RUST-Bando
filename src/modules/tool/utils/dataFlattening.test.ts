import { describe, expect, it } from 'vitest';
import { flattenFeature } from './dataFlattening';
import type { FeatureState, MapState } from '@CONTRACT/types';

describe('dataFlattening', () => {
  it('includes detailed analysis fields from feature, metadata, and GIS data', () => {
    const state: MapState = {
      regions: {
        region1: { id: 'region1', parent_id: null, name: 'Khu A', description: null, is_visible: true },
      },
      layers: {
        layer1: { id: 'layer1', region_id: 'region1', name: 'Lop chinh', is_visible: true },
      },
      feature_groups: {
        group1: { id: 'group1', layer_id: 'layer1', name: 'Camera', type: 'camera', is_visible: true },
      },
      features: {
        'intersection-1': {
          id: 'intersection-1',
          layer_id: 'layer1',
          group_id: 'group1',
          name: 'Nut giao A',
          geom_type: 'POINT',
          metadata: {
            display_order: '12',
            type: 'INTERSECTION',
            icon: 'intersection',
          },
          properties: {},
          coordinates: [106.6, 10.7],
        },
      },
      settings: {},
    };

    const feature: FeatureState = {
      id: 'feature-1',
      layer_id: 'layer1',
      group_id: 'group1',
      name: 'Cam 01',
      geom_type: 'POINT',
      metadata: {
        display_order: '12',
        status: 'Đã kiểm tra',
        note: 'Cảnh báo',
        description: 'Mo ta',
        parent_feature_id: 'intersection-1',
        technical_specs: {
          power: '220V',
        },
        gis: {
          road_name: 'Tran Hung Dao',
        },
      },
      properties: {
        owner: 'Doi van hanh',
      },
      coordinates: [106.7, 10.8],
      is_visible: false,
      length: 12.5,
      area: 0,
    };

    const row = flattenFeature(feature, state);

    expect(row.id).toBe('feature-1');
    expect(row.display_order).toBe('12');
    expect(row.group).toBe('Camera');
    expect(row.layer).toBe('Lop chinh');
    expect(row.region).toBe('Khu A');
    expect(row.status).toBe('Đã kiểm tra');
    expect(row.note).toBe('Cảnh báo');
    expect(row.owner).toBe('Doi van hanh');
    expect(row.power).toBe('220V');
    expect(row.GIS_road_name).toBe('Tran Hung Dao');
    expect(row.longitude).toBe(106.7);
    expect(row.latitude).toBe(10.8);
    expect(row.is_visible).toBe(false);
    expect(row.length).toBe(12.5);
    expect(row.area).toBe(0);
    expect(row.coordinates_summary).toContain('106.7');
    expect(row.source_feature_id).toBe('feature-1');
    expect(row.source_group_id).toBe('group1');
    expect(row.source_group_type).toBe('camera');
    expect(row.source_parent_feature_id).toBe('intersection-1');
    expect(row.parent_intersection_name).toBe('Nut giao A');
    expect(row.parent_intersection_display_order).toBe('12');
    expect(row.source_coordinates).toBe('[106.7,10.8]');
  });
});
