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
  it('preserves point_circle as a point icon', () => {
    const feature = {
      id: 'f-7',
      geom_type: 'POINT',
      name: 'Circle point',
      metadata: JSON.stringify({ type: 'point', icon: 'point_circle', color: '#F59E0B', size: 18 }),
    };

    const info = getFeatureDisplayInfo(feature);

    expect(info.iconKey).toBe('point_circle');
    expect(info.objectType).toBe('point');
    expect(info.color).toBe('#F59E0B');
    expect(info.isCamera).toBe(false);
    expect(info.isIntersection).toBe(false);
  });

  it('infers icon type from feature name when explicit icon is default', () => {
    const cameraFeature = {
      id: 'f-8',
      geom_type: 'POINT',
      name: 'Camera 01',
      metadata: JSON.stringify({ icon: 'default' }),
    };
    const ptzFeature = {
      id: 'f-9',
      geom_type: 'POINT',
      name: 'Camera PTZ 02',
      metadata: JSON.stringify({ icon: 'default' }),
    };
    const speedFeature = {
      id: 'f-10',
      geom_type: 'POINT',
      name: 'Cam Tốc Độ 03',
      metadata: JSON.stringify({ icon: 'default' }),
    };
    const lprFeature = {
      id: 'f-11',
      geom_type: 'POINT',
      name: 'Cam Biển Số 04',
      metadata: JSON.stringify({ icon: 'default' }),
    };
    const intersectionFeature = {
      id: 'f-12',
      geom_type: 'POINT',
      name: 'Nút Giao Phạm Văn Đồng',
      metadata: JSON.stringify({ icon: 'default' }),
    };
    const surveyPointFeature = {
      id: 'f-13',
      geom_type: 'POINT',
      name: 'Điểm Khảo Sát Mới',
      metadata: JSON.stringify({ icon: 'default' }),
    };

    expect(getFeatureDisplayInfo(cameraFeature).iconKey).toBe('cctv');
    expect(getFeatureDisplayInfo(ptzFeature).iconKey).toBe('ptz');
    expect(getFeatureDisplayInfo(speedFeature).iconKey).toBe('speed');
    expect(getFeatureDisplayInfo(lprFeature).iconKey).toBe('lpr');
    expect(getFeatureDisplayInfo(intersectionFeature).iconKey).toBe('intersection');
    expect(getFeatureDisplayInfo(surveyPointFeature).iconKey).toBe('default');
  });
});
