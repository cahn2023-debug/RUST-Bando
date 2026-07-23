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

  it('falls back to camera properties when metadata omits icon and type', () => {
    const feature = {
      id: 'f-3',
      geom_type: 'POINT',
      name: 'Diem Khao Sat Moi',
      metadata: JSON.stringify({ description: 'saved without display fields' }),
      properties: { iconKey: 'cctv', type: 'cctv' },
    };

    const info = getFeatureDisplayInfo(feature);

    expect(info.label).toBe('CCTV');
    expect(info.iconKey).toBe('cctv');
    expect(info.isCamera).toBe(true);
  });

  it('uses camera properties when metadata only has legacy point type', () => {
    const feature = {
      id: 'f-4',
      geom_type: 'POINT',
      name: 'Diem Khao Sat Moi',
      metadata: JSON.stringify({ type: 'point', color: '#3b82f6' }),
      properties: { iconKey: 'cctv', type: 'cctv' },
    };

    const info = getFeatureDisplayInfo(feature);

    expect(info.label).toBe('CCTV');
    expect(info.iconKey).toBe('cctv');
    expect(info.isCamera).toBe(true);
  });

  it('displays a point feature with intersection icon as Nút giao', () => {
    const feature = {
      id: 'f-5',
      geom_type: 'POINT',
      name: 'QL21A',
      metadata: JSON.stringify({ type: 'point', icon: 'intersection' }),
    };

    const info = getFeatureDisplayInfo(feature);

    expect(info.label).toBe('Nút giao');
    expect(info.iconKey).toBe('intersection');
    expect(info.isIntersection).toBe(true);
  });

  it('displays a point feature in an intersection group as Nút giao', () => {
    const feature = {
      id: 'f-6',
      geom_type: 'POINT',
      name: 'QL21A',
      metadata: JSON.stringify({ type: 'point', icon: 'default' }),
    };

    const info = getFeatureDisplayInfo(feature, 'INTERSECTION', 'Nút giao');

    expect(info.label).toBe('Nút giao');
    expect(info.isIntersection).toBe(true);
  });
});
