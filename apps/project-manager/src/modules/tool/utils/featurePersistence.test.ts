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
      color: '#3b82f6',
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
      color: '#10b981',
    });
  });

  it('preserves existing camera type when metadata update omits icon and type', () => {
    const properties: FeatureProperties = {
      icon: 'cctv',
      iconKey: 'cctv',
      type: 'cctv',
    };
    const metadata: FeatureMetadata = {
      description: 'Checked in field',
      media: {
        imageAssetIds: ['asset-1'],
      },
    };

    expect(buildFeaturePropertiesForPersistence(properties, metadata)).toEqual({
      icon: 'cctv',
      iconKey: 'cctv',
      type: 'cctv',
    });
  });

  it('normalizes legacy point type to intersection when intersection icon is selected', () => {
    const properties: FeatureProperties = {
      icon: 'default',
      iconKey: 'default',
      type: 'point',
    };
    const metadata: FeatureMetadata = {
      icon: 'intersection',
      type: 'point',
      color: '#6366f1',
    };

    expect(normalizeFeatureMetadataForPersistence(metadata, properties)).toMatchObject({
      icon: 'intersection',
      type: 'intersection',
    });
    expect(buildFeaturePropertiesForPersistence(properties, metadata)).toMatchObject({
      icon: 'intersection',
      iconKey: 'intersection',
      type: 'intersection',
    });
  });

  it('canonicalizes camera alias to cctv when persisting symbol data', () => {
    const metadata: FeatureMetadata = {
      icon: 'cctv',
      type: 'camera',
    };

    expect(normalizeFeatureMetadataForPersistence(metadata)).toMatchObject({
      icon: 'cctv',
      type: 'cctv',
    });
    expect(buildFeaturePropertiesForPersistence(undefined, metadata)).toMatchObject({
      icon: 'cctv',
      iconKey: 'cctv',
      type: 'cctv',
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

  it('persists GIS style aliases into feature properties', () => {
    const properties: FeatureProperties = {
      icon: 'default',
      iconKey: 'default',
      type: 'point',
      color: '#111111',
      size: 16,
    };
    const metadata: FeatureMetadata = {
      icon: 'point_circle',
      color: '#222222',
      size: 18,
      gis: {
        color: '#3b82f6',
        size: 42,
      },
    };

    expect(buildFeaturePropertiesForPersistence(properties, metadata)).toMatchObject({
      icon: 'point_circle',
      iconKey: 'point_circle',
      type: 'point',
      color: '#3b82f6',
      size: 42,
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
      coordinates: [106.1, 10.2],
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
