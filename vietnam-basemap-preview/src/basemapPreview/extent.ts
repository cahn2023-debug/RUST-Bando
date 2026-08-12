export type PreviewPoint = [number, number];

export interface PreviewExtent {
    west: number;
    south: number;
    east: number;
    north: number;
}

export function getPreviewExtent(value: unknown): PreviewExtent | null {
    const points: PreviewPoint[] = [];
    collectPoints(value, points);
    if (points.length === 0) return null;

    return points.reduce<PreviewExtent>(
        (extent, [lng, lat]) => ({
            west: Math.min(extent.west, lng),
            south: Math.min(extent.south, lat),
            east: Math.max(extent.east, lng),
            north: Math.max(extent.north, lat),
        }),
        { west: points[0][0], south: points[0][1], east: points[0][0], north: points[0][1] },
    );
}

function collectPoints(value: unknown, points: PreviewPoint[]): void {
    if (Array.isArray(value)) {
        if (isPoint(value)) {
            points.push([value[0], value[1]]);
            return;
        }
        value.forEach(item => collectPoints(item, points));
        return;
    }

    if (!isRecord(value)) return;
    if (value.type === 'FeatureCollection' && Array.isArray(value.features)) {
        value.features.forEach(feature => collectPoints(feature, points));
        return;
    }
    if (value.type === 'Feature' && value.geometry) {
        collectPoints(value.geometry, points);
        return;
    }
    if (value.geometry) {
        collectPoints(value.geometry, points);
        return;
    }
    if (value.coordinates) collectPoints(value.coordinates, points);
}

function isPoint(value: unknown[]): value is [number, number] {
    return value.length >= 2 &&
        typeof value[0] === 'number' && Number.isFinite(value[0]) &&
        typeof value[1] === 'number' && Number.isFinite(value[1]);
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null;
}
