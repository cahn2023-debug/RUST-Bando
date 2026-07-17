import { describe, expect, it } from 'vitest';
import type { FeatureMetadata, FeatureProperties } from '@CONTRACT/types';
import {
  buildFeatureCreatedPayload,
  buildFeaturePropertiesForPersistence,
  getTypeForIcon,
  isRenderableFeatureGeometry,
  normalizeFeatureMetadataForPersistence,
} from './featurePersistence';

describe('featurePersistence', () => {
  it('maps default icon back to point type', () => {
    expect(getTypeForIcon('default')).toBe('point');
  });

  it('builds persisted properties for CCTV from a point feature', () => {
    const properties: FeatureProperties = {
      label: 'Camera A',
      iconKey: 'default',
      type: 'point',
    };
    const metadata: FeatureMetadata = {
      icon: 'cctv',
      type: 'cctv',
      color: '#3b82f6',
    };

    expect(buildFeaturePropertiesForPersistence(properties, metadata)).toEqual({
      label: 'Camera A',
      icon: 'cctv',
      iconKey: 'cctv',
      type: 'cctv',
    });
  });

  it('falls back to point when metadata icon is reset to default', () => {
    const properties: FeatureProperties = {
      icon: 'ptz',
      iconKey: 'ptz',
      type: 'ptz',
    };
    const metadata: FeatureMetadata = {
      icon: 'default',
      color: '#10b981',
    };

    expect(buildFeaturePropertiesForPersistence(properties, metadata)).toEqual({
      icon: 'default',
      iconKey: 'default',
      type: 'point',
    });
  });

  it('keeps explicit metadata type when icon changes to PTZ', () => {
    const properties: FeatureProperties = {
      iconKey: 'cctv',
      type: 'cctv',
    };
    const metadata: FeatureMetadata = {
      icon: 'ptz',
      type: 'ptz',
    };

    expect(buildFeaturePropertiesForPersistence(properties, metadata)).toEqual({
      icon: 'ptz',
      iconKey: 'ptz',
      type: 'ptz',
    });
  });

  it('normalizes metadata aliases before persistence', () => {
    const metadata: FeatureMetadata = {
      icon: 'default',
      STT: '12.0',
    };

    expect(normalizeFeatureMetadataForPersistence(metadata)).toMatchObject({
      icon: 'default',
      type: 'point',
      display_order: '12',
    });
  });

  it('builds a map-native FeatureCreated payload with normalized properties', () => {
    const payload = buildFeatureCreatedPayload({
      id: 'feature-1',
      layer_id: 'layer-1',
      group_id: 'group-1',
      name: 'Camera A',
      geom_type: 'Point',
      coordinates: [106.1, 10.2],
      metadata: {
        icon: 'cctv',
        type: 'cctv',
        STT: '7',
      },
    });

    expect(payload).toMatchObject({
      id: 'feature-1',
      layer_id: 'layer-1',
      group_id: 'group-1',
      name: 'Camera A',
      geom_type: 'Point',
      coordinates: JSON.stringify([106.1, 10.2]),
      properties: {
        icon: 'cctv',
        iconKey: 'cctv',
        type: 'cctv',
      },
    });
    expect(JSON.parse(payload.metadata)).toMatchObject({
      icon: 'cctv',
      type: 'cctv',
      display_order: '7',
    });
  });

  it('accepts only renderable geometry shapes for the map', () => {
    expect(isRenderableFeatureGeometry('Point', [106, 10])).toBe(true);
    expect(isRenderableFeatureGeometry('LineString', [[106, 10], [106.1, 10.1]])).toBe(true);
    expect(isRenderableFeatureGeometry('Polygon', [[[106, 10], [106.1, 10.1], [106.2, 10.2]]])).toBe(true);
    expect(isRenderableFeatureGeometry('Point', [106] as any)).toBe(false);
    expect(isRenderableFeatureGeometry('LineString', [[106, 10]] as any)).toBe(false);
  });
});
