import type { MapLibreFastFeatureCollection } from '../mapLibreFastTypes';
import type { PolylineSnapMarker } from '../polylineSnapMarkers';

export const buildDrawingOverlay = (
    currentDrawingPoints: [number, number][],
    snappedPoint: { x: number; y: number; id?: string } | null
): MapLibreFastFeatureCollection => {
    const features: MapLibreFastFeatureCollection['features'] = [];
    if (currentDrawingPoints.length >= 2) {
        features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: currentDrawingPoints },
            properties: { kind: 'drawing-line' },
        });
    }
    currentDrawingPoints.forEach((point, index) => {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: point },
            properties: { kind: 'drawing-vertex', index },
        });
    });
    if (snappedPoint) {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [snappedPoint.x, snappedPoint.y] },
            properties: { kind: 'snap' },
        });
    }
    return { type: 'FeatureCollection', features };
};

export const buildEditOverlay = (
    coords: [number, number][],
    snapMarkers: PolylineSnapMarker[] = []
): MapLibreFastFeatureCollection => {
    const features: MapLibreFastFeatureCollection['features'] = [];
    coords.forEach((point, index) => {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: point },
            properties: { kind: 'vertex', index },
        });
    });
    coords.slice(0, -1).forEach((point, index) => {
        const next = coords[index + 1];
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2] },
            properties: { kind: 'midpoint', index: index + 1 },
        });
    });
    snapMarkers.forEach(marker => {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: marker.coordinate },
            properties: { kind: 'snap-link', index: marker.index, targetId: marker.targetId },
        });
    });
    return { type: 'FeatureCollection', features };
};
