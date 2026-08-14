import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@IMPLEMENT/lib/tauri', () => ({
  safeInvoke: vi.fn(),
}));

import { analysisService, buildAnalysisImportEvents, getExcelColumnName } from './analysisService';
import type { MapState } from '@CONTRACT/types';

describe('analysisService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates Excel column names correctly', () => {
    expect(getExcelColumnName(1)).toBe('A');
    expect(getExcelColumnName(2)).toBe('B');
    expect(getExcelColumnName(26)).toBe('Z');
    expect(getExcelColumnName(27)).toBe('AA');
    expect(getExcelColumnName(28)).toBe('AB');
  });

  it('builds workbook events correctly from preview and resolutions', () => {
    const preview = {
      changes: [
        {
          id: 'feat1::name',
          featureId: 'feat1',
          changeType: 'EXCEL_ONLY' as const,
          field: 'name',
          excelValue: 'Tên mới từ Excel',
          isConflict: false,
        },
        {
          id: 'feat2::note',
          featureId: 'feat2',
          changeType: 'BOTH_CONFLICT' as const,
          field: 'note',
          designValue: 'Ghi chú DESIGN',
          excelValue: 'Ghi chú Excel',
          isConflict: true,
        },
      ],
      newItems: [],
      updatedItems: [],
      ignoredItems: [],
      errors: [],
      conflicts: [],
      isValidWorkbook: true,
    };

    const resolutions = {
      'feat2::note': 'EXCEL' as const,
    };

    const events = analysisService.buildWorkbookEvents(preview, resolutions);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'FeatureUpdated',
      payload: { id: 'feat1', name: 'Tên mới từ Excel' },
    });
    expect(events[1]).toEqual({
      type: 'FeatureUpdated',
      payload: { id: 'feat2', metadata: JSON.stringify({ note: 'Ghi chú Excel' }) },
    });
  });

  it('creates features and restores parent intersection relationships from analysis export rows', () => {
    const ids = [
      'region-new',
      'layer-new',
      'group-new',
      'feature-parent-new',
      'feature-child-new',
    ];
    const randomUUID = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockImplementation(() => (ids.shift() || 'fallback-id') as `${string}-${string}-${string}-${string}-${string}`);

    const state: MapState = {
      regions: {},
      layers: {},
      feature_groups: {},
      features: {},
      settings: {},
    };

    const events = buildAnalysisImportEvents([
      {
        source_feature_id: 'source-parent',
        name: 'Nut giao 01',
        display_order: '15',
        group: 'Camera',
        layer: 'Lop 1',
        region: 'Khu A',
        source_coordinates: '[106.1,10.1]',
        source_technical_geom: 'POINT',
        source_type: 'INTERSECTION',
        source_icon: 'intersection',
      },
      {
        source_feature_id: 'source-child',
        source_parent_feature_id: 'source-parent',
        name: 'Cam 01',
        display_order: '15_1',
        group: 'Camera',
        layer: 'Lop 1',
        region: 'Khu A',
        source_coordinates: '[106.2,10.2]',
        source_technical_geom: 'POINT',
      },
    ], state);

    expect(randomUUID).toHaveBeenCalledTimes(5);
    expect(events.map((event) => event.type)).toEqual([
      'RegionCreated',
      'LayerCreated',
      'FeatureGroupCreated',
      'FeatureCreated',
      'FeatureCreated',
      'FeatureUpdated',
    ]);

    const parentCreate = events[3];
    const childCreate = events[4];
    const childUpdate = events[5];

    expect(parentCreate.type).toBe('FeatureCreated');
    if (parentCreate.type === 'FeatureCreated') {
      expect(parentCreate.payload.id).toBe('feature-parent-new');
      expect(parentCreate.payload.group_id).toBe('group-new');
    }

    expect(childCreate.type).toBe('FeatureCreated');
    if (childCreate.type === 'FeatureCreated') {
      expect(childCreate.payload.id).toBe('feature-child-new');
      expect(childCreate.payload.group_id).toBe('group-new');
    }

    expect(childUpdate.type).toBe('FeatureUpdated');
    if (childUpdate.type === 'FeatureUpdated') {
      expect(childUpdate.payload.id).toBe('feature-child-new');
      expect(childUpdate.payload.metadata).toContain('"parent_feature_id":"feature-parent-new"');
      expect(childUpdate.payload.metadata).toContain('"source_parent_feature_id":"source-parent"');
    }
  });
});

