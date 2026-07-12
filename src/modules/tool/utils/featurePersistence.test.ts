import { describe, expect, it } from 'vitest';
import type { FeatureMetadata, FeatureProperties } from '@CONTRACT/types';
import { buildFeaturePropertiesForPersistence, getTypeForIcon } from './featurePersistence';

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
});
