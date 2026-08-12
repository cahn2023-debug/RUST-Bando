import { describe, expect, it } from 'vitest';
import {
  buildAnalysisExportRows,
  getAnalysisUserColumnKeys,
  isAllowedAnalysisDynamicColumnKey,
  normalizeAnalysisColumnKey,
} from './analysisColumns';

describe('analysisColumns', () => {
  it('keeps user scalar fields and removes system/internal fields', () => {
    const keys = getAnalysisUserColumnKeys([
      {
        properties: {
          owner: 'Doi van hanh',
          priority: 2,
          icon: 'cctv',
          source_properties: 'raw',
          GIS_road_name: 'hidden',
          nested: { value: 'hidden' },
        },
        metadata: {
          custom_note: 'visible',
          description: 'hidden',
          notes: 'hidden',
          imported_from: 'excel',
          media: 'hidden',
          ai: 'hidden',
          gis: { road_name: 'hidden' },
          technical_specs: { power: 'hidden' },
        },
      },
    ]);

    expect(keys).toEqual(['custom_note', 'owner', 'priority']);
  });

  it('allows a manually-created empty user column', () => {
    const keys = getAnalysisUserColumnKeys(
      [{ properties: { owner: 'Doi van hanh' }, metadata: {} }],
      ['ngay_khao_sat'],
    );

    expect(keys).toEqual(['ngay_khao_sat', 'owner']);
  });

  it('normalizes labels and rejects reserved dynamic keys', () => {
    expect(normalizeAnalysisColumnKey('Ngày khảo sát')).toBe('ngay_khao_sat');
    expect(isAllowedAnalysisDynamicColumnKey('owner')).toBe(true);
    expect(isAllowedAnalysisDynamicColumnKey('GIS_road_name')).toBe(false);
    expect(isAllowedAnalysisDynamicColumnKey('coordinates_summary')).toBe(false);
    expect(isAllowedAnalysisDynamicColumnKey('imported_tile_id')).toBe(false);
  });

  it('exports only the selected analysis columns', () => {
    const rows = buildAnalysisExportRows(
      [{ name: 'Cam 01', owner: 'Doi van hanh', GIS_road_name: 'hidden' }],
      ['name', 'owner'],
      (key) => key.toUpperCase(),
    );

    expect(rows).toEqual([{ NAME: 'Cam 01', OWNER: 'Doi van hanh' }]);
  });
});
