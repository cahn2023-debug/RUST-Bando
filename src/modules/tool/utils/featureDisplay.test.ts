import { describe, expect, it } from 'vitest';
import { getFeatureDisplayInfo } from './featureDisplay';

describe('featureDisplay preview metadata', () => {
  it('uses provided metadata to switch point into CCTV immediately', () => {
    const feature = {
      id: 'f-1',
      geom_type: 'POINT',
      name: 'Điểm Khảo Sát Mới',
      metadata: JSON.stringify({ icon: 'default', color: '#3b82f6' }),
    };

    const info = getFeatureDisplayInfo(feature, undefined, undefined, {
      icon: 'cctv',
      color: '#3b82f6',
    });

    expect(info.label).toBe('CCTV');
    expect(info.iconKey).toBe('cctv');
    expect(info.isCamera).toBe(true);
  });

  it('keeps CCTV display when legacy type is still point', () => {
    const feature = {
      id: 'f-2',
      geom_type: 'POINT',
      name: 'Legacy Point Camera',
      metadata: JSON.stringify({ type: 'point', icon: 'cctv', color: '#3b82f6' }),
    };

    const info = getFeatureDisplayInfo(feature);

    expect(info.label).toBe('CCTV');
    expect(info.iconKey).toBe('cctv');
    expect(info.isCamera).toBe(true);
  });
});
