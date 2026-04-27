import { useMemo } from 'react';
import { FeatureState } from '@CONTRACT/types';
import { getParsedMetadata as getBaseParsedMetadata, getParsedCoordinates, calculateFeatureNumbers } from '@TOOL/utils/featureUtils';

// V61: Lightweight Spatial Index (Grid-based)
// Efficiently stores features in grid cells for fast spatial queries.
class GridIndex {
    private grid: Map<string, string[]> = new Map();
    private cellSize: number = 0.05; // ~5km at equator, good for city-scale projects

    constructor(features: Record<string, FeatureState>, featureBounds: Record<string, any>) {
        Object.keys(features).forEach(id => {
            const bbox = featureBounds[id];
            if (!bbox) return;

            const minX = Math.floor(bbox.min_x / this.cellSize);
            const maxX = Math.floor(bbox.max_x / this.cellSize);
            const minY = Math.floor(bbox.min_y / this.cellSize);
            const maxY = Math.floor(bbox.max_y / this.cellSize);

            for (let x = minX; x <= maxX; x++) {
                for (let y = minY; y <= maxY; y++) {
                    const key = `${x},${y}`;
                    if (!this.grid.has(key)) this.grid.set(key, []);
                    this.grid.get(key)!.push(id);
                }
            }
        });
    }

    query(bounds: { s: number; n: number; w: number; e: number }): Set<string> {
        const result = new Set<string>();
        const minX = Math.floor(bounds.w / this.cellSize);
        const maxX = Math.floor(bounds.e / this.cellSize);
        const minY = Math.floor(bounds.s / this.cellSize);
        const maxY = Math.floor(bounds.n / this.cellSize);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const key = `${x},${y}`;
                const ids = this.grid.get(key);
                if (ids) {
                    for (const id of ids) result.add(id);
                }
            }
        }
        return result;
    }
}

export const useFeatureHierarchy = (features: Record<string, FeatureState>) => {
    return useMemo(() => {
        const hasVirtualChildren = new Set<string>();
        const depthMap: Record<string, number> = {};
        const memoDepth: Record<string, number> = {};

        const getDepth = (id: string, visited = new Set<string>()): number => {
            if (memoDepth[id] !== undefined) return memoDepth[id];

            const f = features[id];
            if (!f) return 0;
            const meta = getBaseParsedMetadata(f);
            if (!meta.parent_feature_id || visited.has(id)) return 0;

            visited.add(id);
            const depth = 1 + getDepth(String(meta.parent_feature_id), visited);
            memoDepth[id] = depth;
            return depth;
        };

        Object.values(features).forEach(f => {
            const meta = getBaseParsedMetadata(f);
            const idStr = String(f.id);
            if (meta.parent_feature_id) hasVirtualChildren.add(String(meta.parent_feature_id));
            depthMap[idStr] = getDepth(idStr);
        });

        return { hasVirtualChildren, depthMap };
    }, [features]);
};

export const useFeatureNumbering = (features: Record<string, FeatureState>) => {
    return useMemo(() => calculateFeatureNumbers(Object.values(features), features), [features]);
};

export const useVisibleFeatures = (
    features: Record<string, FeatureState>,
    bounds: L.LatLngBounds | null,
    selectedFeatureId: string | null,
    hasVirtualChildren?: Set<string>
) => {
    // V57: Memoize bounds components
    const boundsValues = useMemo(() => {
        if (!bounds) return null;
        return {
            s: bounds.getSouth(),
            n: bounds.getNorth(),
            w: bounds.getWest(),
            e: bounds.getEast()
        };
    }, [bounds]);

    // V62: Fast coordinate & BBOX cache. 
    // This is the core optimization to avoid repeated JSON.parse and expensive loops.
    const optimizedFeatureData = useMemo(() => {
        const boundsCache: Record<string, { min_y: number; max_y: number; min_x: number; max_x: number } | null> = {};
        const parsedCoordsCache: Record<string, any> = {};

        Object.values(features).forEach(f => {
            // V63: Use pre-calculated BBOX if available (HUGE optimization)
            if (f.bbox) {
                boundsCache[f.id] = f.bbox as any;
                // V64: Coordinates are lazy-loaded only when actually rendered in the layer components
                return;
            }

            const coords = getParsedCoordinates(f);
            parsedCoordsCache[f.id] = coords;

            if (!coords || !Array.isArray(coords) || (Array.isArray(coords) && coords.length === 0)) {
                boundsCache[f.id] = null;
                return;
            }

            const geomType = (f.geom_type || '').toLowerCase();
            const isPoint = geomType === 'point' || geomType === '' || geomType === 'default';

            if (isPoint) {
                if (coords.length >= 2) {
                    const lng = coords[0] as number;
                    const lat = coords[1] as number;
                    boundsCache[f.id] = { min_y: lat, max_y: lat, min_x: lng, max_x: lng };
                } else {
                    boundsCache[f.id] = null;
                }
                return;
            }

            // Line/Polygon
            const flatCoords = (geomType === 'polygon' && Array.isArray((coords as any)[0]?.[0]))
                ? (coords as any).flat(1)
                : coords;

            if (!Array.isArray(flatCoords) || flatCoords.length === 0) {
                boundsCache[f.id] = null;
                return;
            }

            let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
            let hasValidPoints = false;

            for (let i = 0; i < flatCoords.length; i++) {
                const c = flatCoords[i];
                if (!Array.isArray(c) || c.length < 2) continue;
                const lng = Number(c[0]);
                const lat = Number(c[1]);
                if (isNaN(lng) || isNaN(lat)) continue;

                hasValidPoints = true;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
            }
            boundsCache[f.id] = hasValidPoints ? { min_y: minLat, max_y: maxLat, min_x: minLng, max_x: maxLng } : null;
        });

        return { boundsCache, parsedCoordsCache, spatialIndex: new GridIndex(features, boundsCache as any) };
    }, [features]);

    return useMemo(() => {
        if (!boundsValues) {
            return Object.values(features);
        }

        const { s, n, w, e } = boundsValues;
        const { boundsCache, spatialIndex } = optimizedFeatureData;

        // V61: Use Spatial Index to get candidate IDs
        const candidateIds = spatialIndex.query(boundsValues);

        // Filter candidates accurately
        const visibleFeatures: FeatureState[] = [];

        // Always include selected feature
        if (selectedFeatureId && features[selectedFeatureId]) {
            visibleFeatures.push(features[selectedFeatureId]);
        }

        candidateIds.forEach(id => {
            if (id === selectedFeatureId) return; // Already added

            const f = features[id];
            if (!f) return;

            const bbox = boundsCache[id];
            if (!bbox) {
                // Optimization for parent objects
                if (hasVirtualChildren?.has(id)) {
                    const geomType = (f.geom_type || '').toLowerCase();
                    if (geomType === 'linestring' || geomType === 'polyline' || geomType === 'line' || geomType === 'polygon') {
                        visibleFeatures.push(f);
                    }
                }
                return;
            }

            // Quick AABB intersection check
            if (!(bbox.max_y < s || bbox.min_y > n || bbox.max_x < w || bbox.min_x > e)) {
                visibleFeatures.push(f);
            }
        });

        return visibleFeatures;
    }, [features, boundsValues, selectedFeatureId, optimizedFeatureData, hasVirtualChildren]);
};

