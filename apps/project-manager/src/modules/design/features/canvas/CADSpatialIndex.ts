/**
 * CADSpatialIndex.ts
 * Hệ thống Spatial Bounding Box Indexing phục vụ Viewport Culling siêu tốc (< 1ms)
 */

import type { FeatureState } from '@CONTRACT/types';
import { getParsedCoordinates } from '@TOOL/utils/featureUtils';
import type { BoundingBox } from './CADCoordinateTransform';

export interface IndexedFeature {
  feature: FeatureState;
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  geomType: 'point' | 'line' | 'polygon';
}

function computeFeatureBBox(feature: FeatureState): IndexedFeature | null {
  const coords = getParsedCoordinates(feature);
  if (!coords) return null;

  const rawGeom = String(feature.geom_type || '').toUpperCase();

  // Point case
  if (Array.isArray(coords) && coords.length === 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const [lng, lat] = coords as [number, number];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return {
      feature,
      minLng: lng,
      minLat: lat,
      maxLng: lng,
      maxLat: lat,
      geomType: 'point',
    };
  }

  // Line / Polyline / Polygon case
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let count = 0;

  const processPoint = (pt: any) => {
    if (!pt) return;
    let lng: number | undefined;
    let lat: number | undefined;
    if (Array.isArray(pt) && pt.length >= 2) {
      lng = Number(pt[0]);
      lat = Number(pt[1]);
    } else if (typeof pt === 'object') {
      lng = Number(pt.lng ?? pt.x ?? pt.Longitude ?? pt.longitude);
      lat = Number(pt.lat ?? pt.y ?? pt.Latitude ?? pt.latitude);
    }
    if (lng !== undefined && lat !== undefined && Number.isFinite(lng) && Number.isFinite(lat)) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      count += 1;
    }
  };

  const walkCoords = (item: any) => {
    if (!item) return;
    if (Array.isArray(item)) {
      if (item.length >= 2 && typeof item[0] === 'number' && typeof item[1] === 'number') {
        processPoint(item);
      } else {
        item.forEach(walkCoords);
      }
    } else if (typeof item === 'object') {
      if (item.points || item.coordinates) {
        walkCoords(item.points || item.coordinates);
      } else {
        processPoint(item);
      }
    }
  };

  walkCoords(coords);

  if (count === 0 || minLng === Infinity) return null;

  const isPolygon = rawGeom.includes('POLYGON');
  const isLine = rawGeom.includes('LINE') || rawGeom.includes('CABLE') || rawGeom.includes('POLYLINE') || rawGeom.includes('NETWORK') || count > 1;

  return {
    feature,
    minLng,
    minLat,
    maxLng,
    maxLat,
    geomType: isPolygon ? 'polygon' : isLine ? 'line' : 'point',
  };
}

export class CADSpatialIndex {
  private items: IndexedFeature[] = [];

  public buildIndex(features: Record<string, FeatureState> | FeatureState[]): void {
    const list = Array.isArray(features) ? features : Object.values(features || {});
    const indexed: IndexedFeature[] = [];

    for (const f of list) {
      if (!f) continue;
      const item = computeFeatureBBox(f);
      if (item) indexed.push(item);
    }

    this.items = indexed;
  }

  public query(bbox: BoundingBox): IndexedFeature[] {
    const { minLng, minLat, maxLng, maxLat } = bbox;
    const result: IndexedFeature[] = [];

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      // Bounding Box Overlap Test
      if (
        item.maxLng >= minLng &&
        item.minLng <= maxLng &&
        item.maxLat >= minLat &&
        item.minLat <= maxLat
      ) {
        result.push(item);
      }
    }

    return result;
  }

  public getAll(): IndexedFeature[] {
    return this.items;
  }

  public getCount(): number {
    return this.items.length;
  }
}
