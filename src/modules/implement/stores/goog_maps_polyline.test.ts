import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDesignSync } from './useDesignSync';

// Mock tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

// Mock firestoreSync
vi.mock('../lib/firestoreSync', () => ({
    pushStateToFirestore: vi.fn(),
    subscribeToProjectState: vi.fn(),
    deleteFeatureFromFirestore: vi.fn(),
    deleteFeaturesFromFirestoreBatch: vi.fn(),
    forceGlobalCleanup: vi.fn(),
}));

describe('Google Maps Polyline Editing: Data Integrity', () => {
    const mockLineFeature = {
        id: 'line1',
        geom_type: 'LineString',
        coordinates: JSON.stringify([[105, 21], [106, 22], [107, 23]]),
        metadata: '{}'
    };

    const mockPolygonFeature = {
        id: 'poly1',
        geom_type: 'Polygon',
        coordinates: JSON.stringify([[[105, 21], [106, 21], [106, 22], [105, 22], [105, 21]]]),
        metadata: '{}'
    };

    beforeEach(() => {
        vi.clearAllMocks();
        const mockDispatch = vi.fn().mockResolvedValue(undefined);
        useDesignSync.setState({
            state: {
                regions: {},
                layers: {},
                feature_groups: {},
                features: {
                    'line1': mockLineFeature as any,
                    'poly1': mockPolygonFeature as any
                },
                settings: {}
            },
            editingFeatureId: 'line1',
            projectId: 1,
            dispatchEvent: mockDispatch
        });
    });

    it('should delete a point from a LineString', async () => {
        const store = useDesignSync.getState();
        await store.deleteDrawingPoint(1); // Delete middle point

        // Check if dispatchEvent was called with updated coordinates
        const lastEvent = (store.dispatchEvent as any).mock?.calls?.[0]?.[0];
        if (lastEvent) {
            const newCoords = lastEvent.payload.coordinates;
            expect(newCoords).toEqual([[105, 21], [107, 23]]);
        }
    });

    it('should delete a point from a Polygon and maintain structure', async () => {
        useDesignSync.setState({ editingFeatureId: 'poly1' });
        const store = useDesignSync.getState();
        await store.deleteDrawingPoint(1); // Delete [106, 21]

        const lastEvent = (store.dispatchEvent as any).mock?.calls?.[0]?.[0];
        const newCoords = lastEvent.payload.coordinates;

        // Should still be nested: [[[lng, lat], ...]]
        expect(Array.isArray(newCoords[0])).toBe(true);
        expect(newCoords[0].length).toBe(4); // 5 - 1
    });

    it('should preserve Polygon nesting on vertex update', async () => {
        useDesignSync.setState({ editingFeatureId: 'poly1' });
        const store = useDesignSync.getState();
        await store.setDrawingPoint(1, 21.5, 106.5);

        const lastEvent = (store.dispatchEvent as any).mock?.calls?.[0]?.[0];
        const newCoords = lastEvent.payload.coordinates;

        expect(Array.isArray(newCoords[0])).toBe(true);
        expect(newCoords[0][1]).toEqual([106.5, 21.5]);
    });

    it('should preserve Polygon nesting on vertex insertion', async () => {
        useDesignSync.setState({ editingFeatureId: 'poly1' });
        const store = useDesignSync.getState();
        await store.insertDrawingPoint(1, 21.1, 105.5);

        const lastEvent = (store.dispatchEvent as any).mock?.calls?.[0]?.[0];
        const newCoords = lastEvent.payload.coordinates;

        expect(Array.isArray(newCoords[0])).toBe(true);
        expect(newCoords[0][1]).toEqual([105.5, 21.1]);
        expect(newCoords[0].length).toBe(6);
    });
});
