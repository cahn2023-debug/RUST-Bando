import { describe, it, expect } from 'vitest';
import { normalizeFeatureForDisplay, normalizeMapStateForDisplay } from './normalizeDisplay';

describe('normalizeDisplay tests', () => {
    describe('normalizeFeatureForDisplay', () => {
        it('should safely parse JSON coordinates', () => {
            const f1 = {
                id: 'f1',
                name: 'Point 1',
                geom_type: 'Point',
                coordinates: '[105.12, 21.03]',
                properties: {},
                metadata: {}
            } as any;
            const res = normalizeFeatureForDisplay(f1);
            expect(res.coordinates).toEqual([105.12, 21.03]);
        });

        it('should fallback to legacy properties latitude/longitude if coordinates are empty', () => {
            const f1 = {
                id: 'f1',
                name: 'Point 1',
                geom_type: 'Point',
                coordinates: null,
                properties: {
                    latitude: 21.03,
                    longitude: 105.12
                },
                metadata: {}
            } as any;
            const res = normalizeFeatureForDisplay(f1);
            expect(res.coordinates).toEqual([105.12, 21.03]);
        });

        it('should safely parse double-encoded metadata JSON', () => {
            const f1 = {
                id: 'f1',
                name: 'Point 1',
                geom_type: 'Point',
                coordinates: null,
                properties: {},
                metadata: JSON.stringify(JSON.stringify({
                    display_order: '01',
                    description: 'Hello double encoded'
                }))
            } as any;
            const res = normalizeFeatureForDisplay(f1);
            expect(res.metadata).toBeDefined();
            expect((res.metadata as any).description).toBe('Hello double encoded');
            expect((res.metadata as any).display_order).toBe('1'); // formatted integer string
        });

        it('should sync display_order with STT aliases', () => {
            const f1 = {
                id: 'f1',
                name: 'Point 1',
                geom_type: 'Point',
                coordinates: null,
                properties: {
                    STT: '05'
                },
                metadata: {
                    stt: '05'
                }
            } as any;
            const res = normalizeFeatureForDisplay(f1);
            expect((res.metadata as any).display_order).toBe('5');
            expect((res.metadata as any).stt).toBe('5');
        });

        it('should normalize legacy point type from properties icon into metadata and properties', () => {
            const f1 = {
                id: 'f1',
                name: 'Intersection A',
                geom_type: 'Point',
                coordinates: [105.12, 21.03],
                properties: {
                    iconKey: 'intersection',
                    type: 'intersection'
                },
                metadata: {
                    type: 'point'
                }
            } as any;

            const res = normalizeFeatureForDisplay(f1);

            expect((res.metadata as any).icon).toBe('intersection');
            expect((res.metadata as any).type).toBe('intersection');
            expect((res.properties as any).icon).toBe('intersection');
            expect((res.properties as any).iconKey).toBe('intersection');
            expect((res.properties as any).type).toBe('intersection');
            expect(res.geom_type).toBe('Point');
        });

        it('should compute bbox if missing but coordinates exist', () => {
            const f1 = {
                id: 'f1',
                name: 'Point 1',
                geom_type: 'Point',
                coordinates: [105.12, 21.03],
                properties: {},
                metadata: {}
            } as any;
            const res = normalizeFeatureForDisplay(f1);
            expect(res.bbox).toEqual({
                min_x: 105.12,
                max_x: 105.12,
                min_y: 21.03,
                max_y: 21.03
            });
        });

        it('should fallback to properties when coordinates is an invalid string or empty object', () => {
            const f1 = {
                id: 'f1',
                name: 'Point 1',
                geom_type: 'Point',
                coordinates: 'invalid json string',
                properties: { latitude: 21.03, longitude: 105.12 },
                metadata: {}
            } as any;
            const res = normalizeFeatureForDisplay(f1);
            expect(res.coordinates).toEqual([105.12, 21.03]);

            const f2 = {
                id: 'f2',
                name: 'Point 2',
                geom_type: 'Point',
                coordinates: {},
                properties: { latitude: 21.04, longitude: 105.13 },
                metadata: {}
            } as any;
            const res2 = normalizeFeatureForDisplay(f2);
            expect(res2.coordinates).toEqual([105.13, 21.04]);
        });

        it('should fallback to Location and geometry Coordinates', () => {
            const f1 = {
                id: 'f1',
                name: 'Point 1',
                geom_type: 'Point',
                coordinates: null,
                properties: { Location: { lat: 21.03, lng: 105.12 } },
                metadata: {}
            } as any;
            const res = normalizeFeatureForDisplay(f1);
            expect(res.coordinates).toEqual([105.12, 21.03]);

            const f2 = {
                id: 'f2',
                name: 'Point 2',
                geom_type: 'Point',
                coordinates: null,
                properties: { geometry: { Coordinates: [105.13, 21.04] } },
                metadata: {}
            } as any;
            const res2 = normalizeFeatureForDisplay(f2);
            expect(res2.coordinates).toEqual([105.13, 21.04]);
        });
    });

    describe('normalizeMapStateForDisplay', () => {
        it('should normalize the entire MapState properly', () => {
            const state = {
                regions: [
                    { id: 'r1', name: 'Region 1' }
                ],
                layers: {
                    l1: { id: 'l1', name: 'Layer 1' }
                },
                feature_groups: [
                    { id: 'g1', name: 'Group 1', metadata: '{"theme": "dark"}' }
                ],
                features: [
                    {
                        id: 'f1',
                        name: 'Feature 1',
                        coordinates: '[105.12, 21.03]',
                        metadata: '{"stt": "1"}'
                    }
                ],
                settings: {}
            } as any;

            const res = normalizeMapStateForDisplay(state);
            expect(res.regions.r1).toBeDefined();
            expect(res.layers.l1).toBeDefined();
            expect(res.feature_groups.g1).toBeDefined();
            expect(((res.feature_groups.g1 as any).metadata).theme).toBe('dark');
            expect(res.features.f1).toBeDefined();
            expect(res.features.f1.coordinates).toEqual([105.12, 21.03]);
            expect((res.features.f1.metadata as any).display_order).toBe('1');
        });

        it('should normalize symbol data from object and array state shapes', () => {
            const feature = {
                id: 'f1',
                name: 'QL21A',
                group_id: 'g1',
                geom_type: 'Point',
                coordinates: [105.12, 21.03],
                metadata: { type: 'point' },
                properties: { iconKey: 'default', type: 'point' }
            };
            const group = {
                id: 'g1',
                layer_id: 'l1',
                name: 'Nút giao',
                type: 'INTERSECTION',
                is_visible: true
            };
            const objectState = {
                regions: {},
                layers: {},
                feature_groups: { g1: group },
                features: { f1: feature },
                settings: {}
            } as any;
            const arrayState = {
                regions: [],
                layers: [],
                feature_groups: [group],
                features: [feature],
                settings: {}
            } as any;

            const objectResult = normalizeMapStateForDisplay(objectState);
            const arrayResult = normalizeMapStateForDisplay(arrayState);

            expect((objectResult.features.f1.metadata as any).icon).toBe('intersection');
            expect((objectResult.features.f1.metadata as any).type).toBe('intersection');
            expect((objectResult.features.f1.properties as any).iconKey).toBe('intersection');
            expect((arrayResult.features.f1.metadata as any).icon).toBe('intersection');
            expect((arrayResult.features.f1.metadata as any).type).toBe('intersection');
            expect((arrayResult.features.f1.properties as any).iconKey).toBe('intersection');
        });
    });
});
