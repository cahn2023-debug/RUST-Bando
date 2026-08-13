import type { PreviewFileReader, PreviewManifest } from './types';
import type { PreviewExtent, PreviewPoint } from './extent';
import { normalizeStreetViewViewpoint, type StreetViewViewpoint } from './streetView';

export const STREET_VIEW_COVERAGE_VERSION = 1;

export interface StreetViewCoverageSegment { id: string; path: PreviewPoint[]; }
export interface StreetViewCoveragePanorama {
    id: string;
    point: PreviewPoint;
    heading: number;
    pitch: number;
    fov: number;
}
export interface StreetViewCoverage {
    version: typeof STREET_VIEW_COVERAGE_VERSION;
    segments: StreetViewCoverageSegment[];
    panoramas: StreetViewCoveragePanorama[];
}
export interface StreetViewCoverageViewport { coverage: StreetViewCoverage; extent: PreviewExtent; }
export interface StreetViewCoverageLoadResult {
    coverage: StreetViewCoverage;
    source: 'local' | 'empty';
    message?: string;
}

export function emptyStreetViewCoverage(): StreetViewCoverage {
    return { version: STREET_VIEW_COVERAGE_VERSION, segments: [], panoramas: [] };
}

export function normalizeStreetViewCoverage(value: unknown): StreetViewCoverage {
    if (!isRecord(value) || value.version !== STREET_VIEW_COVERAGE_VERSION) {
        throw new Error('Street View coverage không tương thích');
    }
    const segments = Array.isArray(value.segments)
        ? value.segments.map(normalizeSegment).filter((segment): segment is StreetViewCoverageSegment => segment !== null)
        : [];
    const panoramas = Array.isArray(value.panoramas)
        ? value.panoramas.map(normalizePanorama).filter((panorama): panorama is StreetViewCoveragePanorama => panorama !== null)
        : [];
    return { version: STREET_VIEW_COVERAGE_VERSION, segments, panoramas };
}

export function filterStreetViewCoverage(coverage: StreetViewCoverage, extent: PreviewExtent): StreetViewCoverageViewport {
    const panoramas = coverage.panoramas.filter(panorama => isPointInExtent(panorama.point, extent));
    const segments = coverage.segments.filter(segment => segmentIntersectsExtent(segment.path, extent));
    return { coverage: { version: coverage.version, segments, panoramas }, extent };
}

export function selectNearestStreetViewPanorama(coverage: StreetViewCoverageViewport, point: PreviewPoint): StreetViewViewpoint | null {
    let nearest: StreetViewCoveragePanorama | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const panorama of coverage.coverage.panoramas) {
        const distance = distanceSquared(point, panorama.point);
        if (distance < nearestDistance || (distance === nearestDistance && panorama.id < (nearest?.id ?? ''))) {
            nearest = panorama;
            nearestDistance = distance;
        }
    }
    return nearest ? normalizeStreetViewViewpoint(nearest) : null;
}

export async function loadLocalStreetViewCoverage(manifest: PreviewManifest | null, reader: PreviewFileReader | null): Promise<StreetViewCoverageLoadResult> {
    const path = manifest?.assets.streetViewCoverage;
    if (!path) return { coverage: emptyStreetViewCoverage(), source: 'empty' };
    if (!reader) throw new Error('Local package reader chưa sẵn sàng');
    const bytes = await reader.read(path);
    return {
        coverage: normalizeStreetViewCoverage(JSON.parse(new TextDecoder().decode(bytes)) as unknown),
        source: 'local',
        message: 'Đang dùng dữ liệu Street View cục bộ',
    };
}

function normalizeSegment(value: unknown): StreetViewCoverageSegment | null {
    if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim() || !Array.isArray(value.path)) return null;
    const path = value.path.map(normalizePoint).filter((point): point is PreviewPoint => point !== null);
    return path.length >= 2 ? { id: value.id, path } : null;
}

function normalizePanorama(value: unknown): StreetViewCoveragePanorama | null {
    if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) return null;
    const point = normalizePoint(value.point);
    if (!point) return null;
    return {
        id: value.id,
        point,
        heading: typeof value.heading === 'number' ? value.heading : 0,
        pitch: typeof value.pitch === 'number' ? value.pitch : 0,
        fov: typeof value.fov === 'number' ? value.fov : 90,
    };
}

function normalizePoint(value: unknown): PreviewPoint | null {
    if (!Array.isArray(value) || value.length < 2) return null;
    const [lng, lat] = value;
    return typeof lng === 'number' && Number.isFinite(lng) && typeof lat === 'number' && Number.isFinite(lat) ? [lng, lat] : null;
}

function isPointInExtent(point: PreviewPoint, extent: PreviewExtent): boolean {
    return point[0] >= extent.west && point[0] <= extent.east && point[1] >= extent.south && point[1] <= extent.north;
}

function segmentIntersectsExtent(path: PreviewPoint[], extent: PreviewExtent): boolean {
    const bounds = path.reduce((result, [lng, lat]) => ({
        west: Math.min(result.west, lng), south: Math.min(result.south, lat), east: Math.max(result.east, lng), north: Math.max(result.north, lat),
    }), { west: Number.POSITIVE_INFINITY, south: Number.POSITIVE_INFINITY, east: Number.NEGATIVE_INFINITY, north: Number.NEGATIVE_INFINITY });
    return bounds.east >= extent.west && bounds.west <= extent.east && bounds.north >= extent.south && bounds.south <= extent.north;
}

function distanceSquared(a: PreviewPoint, b: PreviewPoint): number {
    const latitudeScale = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
    return ((a[0] - b[0]) * latitudeScale) ** 2 + (a[1] - b[1]) ** 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
