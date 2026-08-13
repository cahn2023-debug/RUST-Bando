import { describe, expect, it } from 'vitest';
import {
    createPublicStreetViewUrl,
    createStreetViewRouteUrl,
    moveStreetViewPoint,
    normalizeStreetViewViewpoint,
    parseStreetViewSyncPayload,
    parseStreetViewViewpoint,
} from './streetView';

describe('street view bridge values', () => {
    it('normalizes heading, pitch and fov', () => {
        expect(normalizeStreetViewViewpoint({ point: [105, 10], heading: -20, pitch: 200, fov: 1 })).toEqual({
            point: [105, 10], heading: 340, pitch: 90, fov: 30,
        });
    });

    it('round-trips route query values', () => {
        const url = createStreetViewRouteUrl({ point: [105.1, 10.2], heading: 45, pitch: 3, fov: 80 });
        expect(parseStreetViewViewpoint(new URL(url, 'https://preview.local/').search)).toEqual({
            point: [105.1, 10.2], heading: 45, pitch: 3, fov: 80,
        });
    });

    it('builds a public embed and moves the fallback viewpoint', () => {
        const viewpoint = { point: [105, 10] as [number, number], heading: 90, pitch: 0, fov: 90 };
        const publicUrl = createPublicStreetViewUrl(viewpoint);
        expect(publicUrl).toContain('cbll=10%2C105');
        expect(publicUrl).not.toContain('key=');
        const moved = moveStreetViewPoint(viewpoint, 12);
        expect(moved.point[0]).toBeGreaterThan(viewpoint.point[0]);
        expect(moved.point[1]).toBeCloseTo(viewpoint.point[1], 3);
    });

    it('keeps the same route contract for window reuse with a new viewpoint', () => {
        const first = createStreetViewRouteUrl({ point: [105, 10], heading: 0, pitch: 0, fov: 90 });
        const second = createStreetViewRouteUrl({ point: [105.1, 10.1], heading: 45, pitch: 5, fov: 80 });

        expect(new URL(first, 'https://preview.local/').pathname).toBe('/index.html');
        expect(new URL(second, 'https://preview.local/').pathname).toBe('/index.html');
        expect(second).toContain('lat=10.1');
        expect(second).toContain('lng=105.1');
    });

    it('validates lifecycle payloads before they reach the map', () => {
        expect(parseStreetViewSyncPayload({ status: 'closed' })).toEqual({ status: 'closed' });
        expect(parseStreetViewSyncPayload({ status: 'state', viewpoint: { point: [105, 10], heading: 20 } })).toMatchObject({
            status: 'state', viewpoint: { point: [105, 10], heading: 20, pitch: 0, fov: 90 },
        });
        expect(parseStreetViewSyncPayload({ status: 'state', viewpoint: { point: ['bad', 10] } })).toBeNull();
    });
});
