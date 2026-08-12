import { describe, it, expect } from 'vitest';
import { buildPolylineSnapMarkers, getLineCoordinateList } from './polylineSnapMarkers';
import type { FeatureState } from '@CONTRACT/types';

describe('polylineSnapMarkers', () => {
    const lineFeature = (metadata: any, coords: [number, number][] = [[105.8, 21.0], [105.81, 21.01]]): FeatureState => ({
        id: 'line-1',
        layer_id: 'layer-1',
        group_id: null,
        name: 'Test Polyline',
        geom_type: 'LineString',
        metadata,
        properties: {},
        coordinates: coords,
    });

    const targetPointA: FeatureState = {
        id: 'target-a',
        layer_id: 'layer-1',
        group_id: null,
        name: 'Point A',
        geom_type: 'Point',
        metadata: {},
        properties: {},
        coordinates: [105.8, 21.0],
    };

    const targetPointB: FeatureState = {
        id: 'target-b',
        layer_id: 'layer-1',
        group_id: null,
        name: 'Point B',
        geom_type: 'Point',
        metadata: {},
        properties: {},
        coordinates: [105.81, 21.01],
    };

    it('should extract coordinate list properly', () => {
        const feature = lineFeature({});
        const coords = getLineCoordinateList(feature);
        expect(coords).toEqual([[105.8, 21.0], [105.81, 21.01]]);
    });

    it('should build snap markers with object metadata', () => {
        const feature = lineFeature({
            start_node_id: 'target-a',
            end_node_id: 'target-b',
        });
        const markers = buildPolylineSnapMarkers(feature, {
            'target-a': targetPointA,
            'target-b': targetPointB,
        });

        expect(markers).toHaveLength(2);
        expect(markers[0]).toEqual({
            index: 0,
            targetId: 'target-a',
            coordinate: [105.8, 21.0],
        });
        expect(markers[1]).toEqual({
            index: 1,
            targetId: 'target-b',
            coordinate: [105.81, 21.01],
        });
    });

    it('should build snap markers with JSON string metadata (release build scenario)', () => {
        const metadataString = JSON.stringify({
            start_node_id: 'target-a',
            end_node_id: 'target-b',
            snap_links: { v0: 'target-a', v1: 'target-b' },
        });
        const feature = lineFeature(metadataString);
        const markers = buildPolylineSnapMarkers(feature, {
            'target-a': targetPointA,
            'target-b': targetPointB,
        });

        expect(markers).toHaveLength(2);
        expect(markers[0].targetId).toBe('target-a');
        expect(markers[1].targetId).toBe('target-b');
    });

    it('should support network metadata format (from_endpoint / to_endpoint)', () => {
        const metadata = {
            network: {
                from_endpoint: { type: 'feature', id: 'target-a' },
                to_endpoint: { type: 'feature', id: 'target-b' },
            },
        };
        const feature = lineFeature(metadata);
        const markers = buildPolylineSnapMarkers(feature, [targetPointA, targetPointB]);

        expect(markers).toHaveLength(2);
        expect(markers[0].targetId).toBe('target-a');
        expect(markers[1].targetId).toBe('target-b');
    });

    it('should handle feature list passed as an Array', () => {
        const feature = lineFeature({
            start_node_id: 'target-a',
            end_node_id: 'target-b',
        });
        const markers = buildPolylineSnapMarkers(feature, [targetPointA, targetPointB]);

        expect(markers).toHaveLength(2);
        expect(markers[0].targetId).toBe('target-a');
        expect(markers[1].targetId).toBe('target-b');
    });

    it('should fallback to vertex coordinates if target feature is missing in record', () => {
        const feature = lineFeature({
            start_node_id: 'missing-a',
            end_node_id: 'missing-b',
        });
        const markers = buildPolylineSnapMarkers(feature, {});

        expect(markers).toHaveLength(2);
        expect(markers[0].coordinate).toEqual([105.8, 21.0]);
        expect(markers[1].coordinate).toEqual([105.81, 21.01]);
    });
});
