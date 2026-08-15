import { describe, it, expect } from 'vitest';
import {
  projectToScreen,
  unprojectFromScreen,
  computeFitBounds,
  calculateGeographicDistance,
  type ViewportState,
} from '../CADCoordinateTransform';
import { CADSpatialIndex } from '../CADSpatialIndex';
import type { FeatureState } from '@CONTRACT/types';

describe('CADCoordinateTransform', () => {
  const viewport: ViewportState = {
    center: [21.0285, 105.8542], // Hanoi [lat, lng]
    zoom: 15,
    width: 800,
    height: 600,
    pixelRatio: 1,
  };

  it('projects center coordinates to canvas center', () => {
    const [screenX, screenY] = projectToScreen(105.8542, 21.0285, viewport);
    expect(screenX).toBeCloseTo(400, 1);
    expect(screenY).toBeCloseTo(300, 1);
  });

  it('unprojects canvas center back to original center coordinates', () => {
    const [lng, lat] = unprojectFromScreen(400, 300, viewport);
    expect(lat).toBeCloseTo(21.0285, 4);
    expect(lng).toBeCloseTo(105.8542, 4);
  });

  it('computes positive distance between distinct geographic coordinates', () => {
    const dist = calculateGeographicDistance([105.8542, 21.0285], [105.8642, 21.0385]);
    expect(dist).toBeGreaterThan(1000); // > 1km
  });

  it('computes fit bounds for multiple point coordinates', () => {
    const points: Array<[number, number]> = [
      [105.8542, 21.0285],
      [105.8642, 21.0385],
    ];
    const fit = computeFitBounds(points, 800, 600);
    expect(fit).not.toBeNull();
    expect(fit?.center[0]).toBeCloseTo(21.0335, 3);
    expect(fit?.center[1]).toBeCloseTo(105.8592, 3);
    expect(fit?.zoom).toBeGreaterThan(10);
  });
});

describe('CADSpatialIndex', () => {
  it('indexes point features and performs viewport bbox query', () => {
    const features: FeatureState[] = [
      {
        id: 'cam-1',
        name: 'Camera 1',
        geom_type: 'Point',
        coordinates: [105.8542, 21.0285],
        layer_id: 'l1',
        group_id: 'g1',
        metadata: { icon: 'cctv', color: '#3b82f6' },
      } as any,
      {
        id: 'cam-far',
        name: 'Camera Far',
        geom_type: 'Point',
        coordinates: [108.0, 16.0], // Da Nang
        layer_id: 'l1',
        group_id: 'g1',
        metadata: { icon: 'speed', color: '#3b82f6' },
      } as any,
    ];

    const index = new CADSpatialIndex();
    index.buildIndex(features);

    expect(index.getCount()).toBe(2);

    // Query bbox around Hanoi
    const results = index.query({
      minLng: 105.8,
      minLat: 21.0,
      maxLng: 105.9,
      maxLat: 21.1,
    });

    expect(results.length).toBe(1);
    expect(results[0].feature.id).toBe('cam-1');
  });
});
