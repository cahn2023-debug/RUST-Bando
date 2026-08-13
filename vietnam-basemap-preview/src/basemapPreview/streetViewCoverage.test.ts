import { describe, expect, it } from 'vitest';
import {
    createPublicStreetViewCoverageUrl,
    loadPublicStreetViewCoverage,
    parsePublicStreetViewCoveragePayload,
} from './streetViewCoverage';

const publicCoveragePayload = [
    [[2, 'pano-a'], null, [[null, null, 10, 105]]],
    [[2, 'pano-b'], null, [[null, null, 10.0001, 105.0001]]],
];

describe('public Street View coverage adapter', () => {
    it('parses public JSONP panorama data into temporary coverage', () => {
        const coverage = parsePublicStreetViewCoveragePayload(`callback(${JSON.stringify(publicCoveragePayload)})`);

        expect(coverage.panoramas).toEqual([
            { id: 'pano-a', point: [105, 10], heading: 0, pitch: 0, fov: 90 },
            { id: 'pano-b', point: [105.0001, 10.0001], heading: 0, pitch: 0, fov: 90 },
        ]);
        expect(coverage.segments).toHaveLength(1);
    });

    it('extracts multiple nested panoramas from the public response shape', () => {
        const coverage = parsePublicStreetViewCoveragePayload(
            `callback(${JSON.stringify([[[2, 'pano-a'], null, [[null, null, 10, 105]]], [[2, 'pano-b'], null, [[null, null, 10.0001, 105.0001]]]])})`,
        );

        expect(coverage.panoramas.map(panorama => panorama.id)).toEqual(['pano-a', 'pano-b']);
    });

    it('builds a keyless public request URL', () => {
        const url = createPublicStreetViewCoverageUrl([105, 10], 250);
        expect(url).toContain('GeoPhotoService.SingleImageSearch');
        expect(url).toContain('3d10');
        expect(url).toContain('4d105');
        expect(url).not.toContain('key=');
    });

    it('loads valid public responses without persisting them', async () => {
        const requests: string[] = [];
        const result = await loadPublicStreetViewCoverage(
            { west: 104.99, south: 9.99, east: 105.01, north: 10.01, maxSamples: 1 },
            async input => {
                requests.push(String(input));
                return new Response(`callback(${JSON.stringify(publicCoveragePayload)})`, { status: 200 });
            },
        );

        expect(result.source).toBe('public');
        expect(result.coverage.panoramas).toHaveLength(2);
        expect(requests).toHaveLength(1);
        expect(requests[0]).not.toContain('key=');
    });

    it('returns empty coverage for unavailable or malformed public responses', async () => {
        const unavailable = await loadPublicStreetViewCoverage(
            { west: 104, south: 9, east: 106, north: 11, maxSamples: 1 },
            async () => new Response('unavailable', { status: 503 }),
        );
        const malformed = await loadPublicStreetViewCoverage(
            { west: 104, south: 9, east: 106, north: 11, maxSamples: 1 },
            async () => new Response('not-json', { status: 200 }),
        );

        expect(unavailable).toEqual({ coverage: { version: 1, segments: [], panoramas: [] }, source: 'empty' });
        expect(malformed).toEqual({ coverage: { version: 1, segments: [], panoramas: [] }, source: 'empty' });
    });
});
