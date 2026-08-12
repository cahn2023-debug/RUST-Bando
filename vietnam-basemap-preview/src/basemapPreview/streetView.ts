import type { PreviewPoint } from './extent';

export const PREVIEW_STREET_VIEW_SYNC_EVENT = 'preview_streetview_sync';
export const PREVIEW_STREET_VIEW_WINDOW_LABEL = 'preview-streetview';

export type StreetViewSyncStatus = 'ready' | 'state' | 'error' | 'closed';

export interface StreetViewViewpoint {
    point: PreviewPoint;
    heading: number;
    pitch: number;
    fov: number;
}

export interface StreetViewSyncPayload {
    status: StreetViewSyncStatus;
    viewpoint?: StreetViewViewpoint;
    message?: string;
}

export function parseStreetViewSyncPayload(value: unknown): StreetViewSyncPayload | null {
    if (!isRecord(value) || !isStreetViewSyncStatus(value.status)) return null;
    if (value.status === 'closed') return { status: 'closed' };
    if (value.status === 'error') {
        return { status: 'error', message: typeof value.message === 'string' ? value.message : 'Street View error' };
    }
    const viewpoint = parseStreetViewViewpointValue(value.viewpoint);
    return viewpoint ? { status: value.status, viewpoint } : null;
}

export const DEFAULT_STREET_VIEW_VIEWPOINT: Omit<StreetViewViewpoint, 'point'> = {
    heading: 0,
    pitch: 0,
    fov: 90,
};

export function normalizeStreetViewViewpoint(value: Partial<StreetViewViewpoint> & { point: PreviewPoint }): StreetViewViewpoint {
    const pitch = value.pitch ?? 0;
    const fov = value.fov ?? 90;
    return {
        point: [value.point[0], value.point[1]],
        heading: normalizeHeading(value.heading),
        pitch: clamp(Number.isFinite(pitch) ? pitch : 0, -90, 90),
        fov: clamp(Number.isFinite(fov) ? fov : 90, 30, 120),
    };
}

export function createPublicStreetViewUrl(viewpoint: StreetViewViewpoint): string {
    const normalized = normalizeStreetViewViewpoint(viewpoint);
    const params = new URLSearchParams({
        layer: 'c',
        cbll: `${normalized.point[1]},${normalized.point[0]}`,
        cbp: `12,${normalized.heading.toFixed(1)},0,${normalized.pitch.toFixed(1)},0`,
        output: 'svembed',
    });
    return `https://maps.google.com/maps?${params.toString()}`;
}

export function createStreetViewRouteUrl(viewpoint: StreetViewViewpoint): string {
    const normalized = normalizeStreetViewViewpoint(viewpoint);
    const params = new URLSearchParams({
        view: 'streetview',
        lat: normalized.point[1].toFixed(7),
        lng: normalized.point[0].toFixed(7),
        heading: normalized.heading.toFixed(1),
        pitch: normalized.pitch.toFixed(1),
        fov: normalized.fov.toFixed(1),
    });
    return `index.html?${params.toString()}`;
}

export function parseStreetViewViewpoint(search: string, fallbackPoint: PreviewPoint = [106.1, 16.2]): StreetViewViewpoint {
    const params = new URLSearchParams(search);
    const point: PreviewPoint = [
        parseNumber(params.get('lng'), fallbackPoint[0]),
        parseNumber(params.get('lat'), fallbackPoint[1]),
    ];
    return normalizeStreetViewViewpoint({
        point,
        heading: parseNumber(params.get('heading'), DEFAULT_STREET_VIEW_VIEWPOINT.heading),
        pitch: parseNumber(params.get('pitch'), DEFAULT_STREET_VIEW_VIEWPOINT.pitch),
        fov: parseNumber(params.get('fov'), DEFAULT_STREET_VIEW_VIEWPOINT.fov),
    });
}

export function moveStreetViewPoint(viewpoint: StreetViewViewpoint, distanceMeters: number): StreetViewViewpoint {
    const earthRadius = 6_371_000;
    const distanceRatio = distanceMeters / earthRadius;
    const heading = (viewpoint.heading * Math.PI) / 180;
    const latitude = (viewpoint.point[1] * Math.PI) / 180;
    const longitude = (viewpoint.point[0] * Math.PI) / 180;
    const nextLatitude = Math.asin(
        Math.sin(latitude) * Math.cos(distanceRatio) +
        Math.cos(latitude) * Math.sin(distanceRatio) * Math.cos(heading),
    );
    const nextLongitude = longitude + Math.atan2(
        Math.sin(heading) * Math.sin(distanceRatio) * Math.cos(latitude),
        Math.cos(distanceRatio) - Math.sin(latitude) * Math.sin(nextLatitude),
    );
    return normalizeStreetViewViewpoint({
        ...viewpoint,
        point: [(nextLongitude * 180) / Math.PI, (nextLatitude * 180) / Math.PI],
    });
}

function normalizeHeading(value: number | undefined): number {
    const heading = Number.isFinite(value) ? value as number : 0;
    return ((heading % 360) + 360) % 360;
}

function parseNumber(value: string | null, fallback: number): number {
    const parsed = value === null ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function parseStreetViewViewpointValue(value: unknown): StreetViewViewpoint | null {
    if (!isRecord(value) || !Array.isArray(value.point) || value.point.length < 2) return null;
    const [lng, lat] = value.point;
    if (typeof lng !== 'number' || !Number.isFinite(lng) || typeof lat !== 'number' || !Number.isFinite(lat)) return null;
    return normalizeStreetViewViewpoint({
        point: [lng, lat],
        heading: typeof value.heading === 'number' ? value.heading : 0,
        pitch: typeof value.pitch === 'number' ? value.pitch : 0,
        fov: typeof value.fov === 'number' ? value.fov : 90,
    });
}

function isStreetViewSyncStatus(value: unknown): value is StreetViewSyncStatus {
    return value === 'ready' || value === 'state' || value === 'error' || value === 'closed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
