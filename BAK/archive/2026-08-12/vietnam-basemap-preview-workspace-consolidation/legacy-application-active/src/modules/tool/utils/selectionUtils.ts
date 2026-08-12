import { FeatureState } from "@CONTRACT/types";
import { getFeatureDisplayInfo, getFeatureNote, safeString } from "@TOOL/utils/featureUtils";

export type FeatureBounds = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

export type NormalizedSelectionItem = {
  id: string;
  name: string;
  geomType: string;
  displayType: string;
  lng: number;
  lat: number;
  note: string;
  groupId: string;
};

// Cache để tránh parse JSON lặp lại cho cùng một feature version
const coordCache = new Map<string, any>();

export function parseCoordinates(feature: FeatureState): any | null {
  if (!feature) return null;

  // Nếu coordinates đã là object/array thì dùng luôn
  if (typeof feature.coordinates !== 'string') return feature.coordinates;

  const cacheKey = `${feature.id}_${(feature.coordinates as string).length}`;
  const cached = coordCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const parsed = JSON.parse(feature.coordinates);
    coordCache.set(cacheKey, parsed);
    // Giới hạn size cache
    if (coordCache.size > 10000) {
      const keys = Array.from(coordCache.keys());
      for (let i = 0; i < 100; i++) coordCache.delete(keys[i]);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getFeatureBounds(feature: FeatureState): FeatureBounds | null {
  const geomType = (feature.geom_type || "").toLowerCase();
  const coords = parseCoordinates(feature);
  if (!coords) return null;

  if (geomType === "point" || geomType === "") {
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0]) || 0;
      const lat = Number(coords[1]) || 0;
      return [lng, lat, lng, lat];
    }
    return null;
  }

  if (geomType === "linestring" || geomType === "polyline") {
    if (!Array.isArray(coords)) return null;
    let minLng = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    let count = 0;

    for (const p of coords) {
      if (Array.isArray(p) && p.length >= 2) {
        const lng = Number(p[0]) || 0;
        const lat = Number(p[1]) || 0;
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        count += 1;
      }
    }

    if (count === 0) return null;
    return [minLng, minLat, maxLng, maxLat];
  }

  if (geomType === "polygon") {
    if (!Array.isArray(coords)) return null;
    let minLng = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    let count = 0;

    for (const ring of coords) {
      if (!Array.isArray(ring)) continue;
      for (const p of ring) {
        if (Array.isArray(p) && p.length >= 2) {
          const lng = Number(p[0]) || 0;
          const lat = Number(p[1]) || 0;
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          count += 1;
        }
      }
    }

    if (count === 0) return null;
    return [minLng, minLat, maxLng, maxLat];
  }

  if (geomType === "rect") {
    if (coords && typeof coords === "object") {
      const x = Number(coords.x) || 0;
      const y = Number(coords.y) || 0;
      const width = Number(coords.width) || 0;
      const height = Number(coords.height) || 0;
      return [x, y, x + width, y + height];
    }
  }

  return null;
}

export function intersectsBounds(a: FeatureBounds, b: FeatureBounds): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

export function normalizeFeatureForSummary(
  feature: FeatureState,
  groupType?: string,
  groupName?: string
): NormalizedSelectionItem {
  const coords = parseCoordinates(feature);
  const geomType = (feature.geom_type || "POINT").toUpperCase();
  let lng = 0;
  let lat = 0;

  if (geomType === "POINT") {
    if (Array.isArray(coords) && coords.length >= 2) {
      lng = Number(coords[0]) || 0;
      lat = Number(coords[1]) || 0;
    }
  } else if (geomType === "POLYGON") {
    const first = Array.isArray(coords) ? coords[0]?.[0] : null;
    if (Array.isArray(first) && first.length >= 2) {
      lng = Number(first[0]) || 0;
      lat = Number(first[1]) || 0;
    }
  } else {
    const first = Array.isArray(coords) ? coords[0] : null;
    if (Array.isArray(first) && first.length >= 2) {
      lng = Number(first[0]) || 0;
      lat = Number(first[1]) || 0;
    }
  }

  const typeInfo = getFeatureDisplayInfo(feature, groupType, groupName);
  const note = getFeatureNote(feature);

  return {
    id: feature.id,
    name: safeString(feature.name || feature.id),
    geomType,
    displayType: typeInfo.label,
    lng,
    lat,
    note,
    groupId: feature.group_id || ""
  };
}
