import { describe, expect, it } from 'vitest';
import { buildAnalysisHierarchyRows, compareAnalysisHierarchyRows } from './analysisHierarchy';
import type { MapState } from '@CONTRACT/types';

describe('analysisHierarchy', () => {
  it('builds intersection rows followed by their children', () => {
    const state: MapState = {
      regions: {
        region1: { id: 'region1', parent_id: null, name: 'Khu A', description: null, is_visible: true },
      },
      layers: {
        layer1: { id: 'layer1', region_id: 'region1', name: 'Lop 1', is_visible: true },
      },
      feature_groups: {
        group1: { id: 'group1', layer_id: 'layer1', name: 'Camera', type: 'camera', is_visible: true },
      },
      features: {
        parent: {
          id: 'parent',
          layer_id: 'layer1',
          group_id: 'group1',
          name: 'Nut giao 02',
          geom_type: 'POINT',
          metadata: { display_order: '2', type: 'INTERSECTION', icon: 'intersection' },
          properties: {},
          coordinates: [106.1, 10.1],
        },
        child: {
          id: 'child',
          layer_id: 'layer1',
          group_id: 'group1',
          name: 'Cam 02',
          geom_type: 'POINT',
          metadata: { display_order: '2_1', parent_feature_id: 'parent', icon: 'cctv' },
          properties: {},
          coordinates: [106.2, 10.2],
        },
        solo: {
          id: 'solo',
          layer_id: 'layer1',
          group_id: 'group1',
          name: 'Cam doc lap',
          geom_type: 'POINT',
          metadata: { display_order: '3', icon: 'cctv' },
          properties: {},
          coordinates: [106.3, 10.3],
        },
      },
      settings: {},
    };

    const rows = buildAnalysisHierarchyRows(state);

    expect(rows.map((row) => row.id)).toEqual(['parent', 'child', 'solo']);
    expect(rows[0].junction_scope).toBe('Nut giao 02');
    expect(rows[1].junction_scope).toBe('Nut giao 02');
    expect(rows[1].__analysis_depth).toBe(1);
  });

  it('uses calculated feature numbers for analysis display order', () => {
    const state: MapState = {
      regions: {
        region1: { id: 'region1', parent_id: null, name: 'Khu A', description: null, is_visible: true },
      },
      layers: {
        layer1: { id: 'layer1', region_id: 'region1', name: 'Lop 1', is_visible: true },
      },
      feature_groups: {
        group1: { id: 'group1', layer_id: 'layer1', name: 'Camera', type: 'camera', is_visible: true },
      },
      features: {
        parent: {
          id: 'parent',
          layer_id: 'layer1',
          group_id: 'group1',
          name: 'Nut giao 15',
          geom_type: 'POINT',
          metadata: { display_order: '15', type: 'INTERSECTION', icon: 'intersection' },
          properties: {},
          coordinates: [106.1, 10.1],
        },
        child: {
          id: 'child',
          layer_id: 'layer1',
          group_id: 'group1',
          name: 'Cam chua luu STT',
          geom_type: 'POINT',
          metadata: { parent_feature_id: 'parent', icon: 'cctv' },
          properties: {},
          coordinates: [106.2, 10.2],
        },
      },
      settings: {},
    };

    const rows = buildAnalysisHierarchyRows(state);
    const childRow = rows.find((row) => row.id === 'child');

    expect(childRow?.display_order).toBe('15_1');
    expect(childRow?.parent_intersection_display_order).toBe('15');
  });

  it('keeps child rows attached to their intersection during sorting', () => {
    const parentA = {
      id: 'parent-a',
      name: 'Nut giao B',
      display_order: '2',
      __analysis_depth: 0,
      __analysis_is_intersection: true,
      __analysis_parent_id: null,
      __analysis_root_id: 'parent-a',
      __analysis_root_values: { name: 'Nut giao B', display_order: '2' },
      __analysis_sort_key: '0002',
      junction_scope: 'Nut giao B',
    };
    const childA = {
      id: 'child-a',
      name: 'Cam A',
      display_order: '2_1',
      __analysis_depth: 1,
      __analysis_is_intersection: false,
      __analysis_parent_id: 'parent-a',
      __analysis_root_id: 'parent-a',
      __analysis_root_values: { name: 'Nut giao B', display_order: '2' },
      __analysis_sort_key: '0002.0001',
      junction_scope: 'Nut giao B',
    };
    const parentB = {
      id: 'parent-b',
      name: 'Nut giao A',
      display_order: '1',
      __analysis_depth: 0,
      __analysis_is_intersection: true,
      __analysis_parent_id: null,
      __analysis_root_id: 'parent-b',
      __analysis_root_values: { name: 'Nut giao A', display_order: '1' },
      __analysis_sort_key: '0001',
      junction_scope: 'Nut giao A',
    };

    const rows = [parentA, childA, parentB].sort((left, right) => compareAnalysisHierarchyRows(left, right, 'name'));

    expect(rows.map((row) => row.id)).toEqual(['parent-b', 'parent-a', 'child-a']);
  });
});
