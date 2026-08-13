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
    source: 'local' | 'public' | 'empty';
    message?: string;
}

export interface PublicStreetViewCoverageRequest extends PreviewExtent {
    maxSamples?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
}

export type StreetViewCoverageFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const PUBLIC_STREET_VIEW_SEARCH_URL = 'https://maps.googleapis.com/maps/api/js/GeoPhotoService.SingleImageSearch';
const DEFAULT_PUBLIC_COVERAGE_SAMPLES = 9;
const MAX_PUBLIC_COVERAGE_SAMPLES = 16;
const MAX_PUBLIC_SEARCH_RADIUS_METERS = 1000;
const DEFAULT_PUBLIC_COVERAGE_TIMEOUT_MS = 8000;

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

export async function loadPublicStreetViewCoverage(
    request: PublicStreetViewCoverageRequest,
    fetcher?: StreetViewCoverageFetcher,
): Promise<StreetViewCoverageLoadResult> {
    const samplePoints = createCoverageSamplePoints(request, request.maxSamples ?? DEFAULT_PUBLIC_COVERAGE_SAMPLES);
    if (samplePoints.length === 0) return { coverage: emptyStreetViewCoverage(), source: 'empty' };

    const radius = getCoverageSearchRadius(request, samplePoints.length);
    const timeoutMs = request.timeoutMs ?? DEFAULT_PUBLIC_COVERAGE_TIMEOUT_MS;
    const responses = await Promise.allSettled(samplePoints.map(point => (
        withRequestTimeout(
            signal => fetcher
                ? fetchPublicCoveragePoint(point, radius, fetcher, signal)
                : fetchPublicCoveragePointJsonp(point, radius, signal),
            request.signal,
            timeoutMs,
        )
    )));
    const coverages = responses
        .filter((result): result is PromiseFulfilledResult<StreetViewCoverage> => result.status === 'fulfilled')
        .map(result => result.value);
    const coverage = mergeStreetViewCoverage(coverages);
    return coverage.panoramas.length > 0
        ? { coverage, source: 'public', message: 'Đang dùng coverage Street View public (best-effort)' }
        : { coverage: emptyStreetViewCoverage(), source: 'empty' };
}

export function parsePublicStreetViewCoveragePayload(value: string): StreetViewCoverage {
    return normalizePublicStreetViewCoveragePayload(parseJsonpPayload(value));
}

function normalizePublicStreetViewCoveragePayload(payload: unknown): StreetViewCoverage {
    const serialized = JSON.stringify(payload);
    const panoramas = extractPublicPanoramas(serialized);
    if (panoramas.length === 0) collectPublicPanoramas(payload, panoramas);
    const uniquePanoramas = dedupePanoramas(panoramas);
    return {
        version: STREET_VIEW_COVERAGE_VERSION,
        segments: buildPublicCoverageSegments(uniquePanoramas),
        panoramas: uniquePanoramas,
    };
}

function extractPublicPanoramas(serialized: string): StreetViewCoveragePanorama[] {
    const panoramas: StreetViewCoveragePanorama[] = [];
    const pattern = /\[2,"([^"]+)"\].*?\[null,null,(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/g;
    for (const match of serialized.matchAll(pattern)) {
        const lat = Number(match[2]);
        const lng = Number(match[3]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            panoramas.push({ id: match[1], point: [lng, lat], heading: 0, pitch: 0, fov: 90 });
        }
    }
    return panoramas;
}

export function createPublicStreetViewCoverageUrl(point: PreviewPoint, radiusMeters: number, callback = '_xdc_._v2mub5'): string {
    const [lng, lat] = point;
    const pb = [
        '!1m5', '!1sapiv3', '!5sUS', '!11m2', '!1m1', '!1b0', '!2m4', '!1m2',
        `!3d${lat}`, `!4d${lng}`, `!2d${Math.round(Math.min(MAX_PUBLIC_SEARCH_RADIUS_METERS, Math.max(50, radiusMeters)))}`,
        '!3m10', '!2m2', '!1sen', '!2sGB', '!9m1', '!1e2', '!11m4', '!1m3', '!1e2', '!2b1', '!3e2',
        '!4m10', '!1e1', '!1e2', '!1e3', '!1e4', '!1e8', '!1e6', '!5m1', '!1e2', '!6m1', '!1e2',
    ].join('');
    const params = new URLSearchParams({ pb, callback });
    return `${PUBLIC_STREET_VIEW_SEARCH_URL}?${params.toString()}`;
}

async function fetchPublicCoveragePoint(
    point: PreviewPoint,
    radiusMeters: number,
    fetcher: StreetViewCoverageFetcher,
    signal?: AbortSignal,
): Promise<StreetViewCoverage> {
    const response = await fetcher(createPublicStreetViewCoverageUrl(point, radiusMeters), {
        headers: { Accept: 'application/javascript,text/javascript,application/json' },
        signal,
    });
    if (!response.ok) throw new Error(`Street View coverage request failed: ${response.status}`);
    return parsePublicStreetViewCoveragePayload(await response.text());
}

function fetchPublicCoveragePointJsonp(point: PreviewPoint, radiusMeters: number, signal?: AbortSignal): Promise<StreetViewCoverage> {
    if (typeof document === 'undefined') return Promise.reject(new Error('Street View coverage JSONP không có DOM'));

    const callbackName = `__previewStreetViewCoverage_${Math.random().toString(36).slice(2)}`;
    const global = globalThis as typeof globalThis & Record<string, unknown>;
    const script = document.createElement('script');
    script.async = true;
    script.src = createPublicStreetViewCoverageUrl(point, radiusMeters, callbackName);

    return new Promise((resolve, reject) => {
        const cleanup = () => {
            delete global[callbackName];
            script.remove();
            signal?.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
            cleanup();
            reject(new DOMException('Coverage request aborted', 'AbortError'));
        };
        global[callbackName] = (payload: unknown) => {
            try {
                const coverage = normalizePublicStreetViewCoveragePayload(payload);
                cleanup();
                resolve(coverage);
            } catch (error) {
                cleanup();
                reject(error);
            }
        };
        script.onerror = () => {
            cleanup();
            reject(new Error('Street View coverage JSONP request failed'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        document.head.appendChild(script);
    });
}

async function withRequestTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    parentSignal: AbortSignal | undefined,
    timeoutMs: number,
): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    const abortFromParent = () => controller.abort();
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
    try {
        return await operation(controller.signal);
    } finally {
        clearTimeout(timeout);
        parentSignal?.removeEventListener('abort', abortFromParent);
    }
}

function createCoverageSamplePoints(extent: PreviewExtent, requestedSamples: number): PreviewPoint[] {
    const sampleCount = Math.min(MAX_PUBLIC_COVERAGE_SAMPLES, Math.max(1, Math.round(requestedSamples)));
    const columns = Math.max(1, Math.ceil(Math.sqrt(sampleCount)));
    const rows = Math.max(1, Math.ceil(sampleCount / columns));
    const points: PreviewPoint[] = [];
    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns && points.length < sampleCount; column += 1) {
            points.push([
                extent.west + ((column + 0.5) / columns) * (extent.east - extent.west),
                extent.south + ((row + 0.5) / rows) * (extent.north - extent.south),
            ]);
        }
    }
    return points.filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
}

function getCoverageSearchRadius(extent: PreviewExtent, sampleCount: number): number {
    const columns = Math.max(1, Math.ceil(Math.sqrt(sampleCount)));
    const rows = Math.max(1, Math.ceil(sampleCount / columns));
    const latitudeMeters = Math.abs(extent.north - extent.south) * 111_320 / rows;
    const longitudeMeters = Math.abs(extent.east - extent.west) * 111_320 * Math.cos(((extent.north + extent.south) / 2) * Math.PI / 180) / columns;
    return Math.min(MAX_PUBLIC_SEARCH_RADIUS_METERS, Math.max(50, Math.hypot(latitudeMeters, longitudeMeters) / 2));
}

function parseJsonpPayload(value: string): unknown {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed) as unknown;
    const open = trimmed.indexOf('(');
    const close = trimmed.lastIndexOf(')');
    if (open < 0 || close <= open) throw new Error('Street View coverage response không hợp lệ');
    return JSON.parse(trimmed.slice(open + 1, close)) as unknown;
}

function collectPublicPanoramas(value: unknown, result: StreetViewCoveragePanorama[]): void {
    if (!Array.isArray(value)) return;
    const id = getPublicPanoramaId(value);
    if (id) {
        const point = findPublicPanoramaPoint(value);
        if (point) {
            result.push({ id, point, heading: 0, pitch: 0, fov: 90 });
            return;
        }
    }
    for (const child of value) collectPublicPanoramas(child, result);
}

function getPublicPanoramaId(value: unknown[]): string | null {
    if (value.length >= 2 && value[0] === 2 && typeof value[1] === 'string') return value[1];
    if (Array.isArray(value[0]) && value[0][0] === 2 && typeof value[0][1] === 'string') return value[0][1];
    return null;
}

function findPublicPanoramaPoint(value: unknown): PreviewPoint | null {
    if (!Array.isArray(value)) return null;
    if (value.length >= 4 && value[0] === null && value[1] === null && typeof value[2] === 'number' && typeof value[3] === 'number') {
        const lat = value[2];
        const lng = value[3];
        return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null;
    }
    for (const child of value) {
        const point = findPublicPanoramaPoint(child);
        if (point) return point;
    }
    return null;
}

function dedupePanoramas(panoramas: StreetViewCoveragePanorama[]): StreetViewCoveragePanorama[] {
    const seen = new Set<string>();
    return panoramas.filter(panorama => {
        if (seen.has(panorama.id)) return false;
        seen.add(panorama.id);
        return true;
    });
}

function mergeStreetViewCoverage(coverages: StreetViewCoverage[]): StreetViewCoverage {
    const panoramas = dedupePanoramas(coverages.flatMap(coverage => coverage.panoramas));
    const segments = dedupeSegments(coverages.flatMap(coverage => coverage.segments));
    return { version: STREET_VIEW_COVERAGE_VERSION, segments, panoramas };
}

function buildPublicCoverageSegments(panoramas: StreetViewCoveragePanorama[]): StreetViewCoverageSegment[] {
    const segments: StreetViewCoverageSegment[] = [];
    for (let index = 1; index < panoramas.length; index += 1) {
        const previous = panoramas[index - 1];
        const current = panoramas[index];
        if (distanceSquared(previous.point, current.point) <= 0.0002 ** 2) {
            segments.push({ id: `${previous.id}-${current.id}`, path: [previous.point, current.point] });
        }
    }
    return segments;
}

function dedupeSegments(segments: StreetViewCoverageSegment[]): StreetViewCoverageSegment[] {
    const seen = new Set<string>();
    return segments.filter(segment => {
        if (seen.has(segment.id)) return false;
        seen.add(segment.id);
        return true;
    });
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
