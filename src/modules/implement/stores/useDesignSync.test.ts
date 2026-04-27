import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDesignSync } from './useDesignSync';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
    emit: vi.fn(),
    listen: vi.fn(),
}));

vi.mock('../lib/firestoreSync', () => ({
    pushStateToFirestore: vi.fn(),
    subscribeToProjectState: vi.fn(),
    deleteFeatureFromFirestore: vi.fn(),
    deleteFeaturesFromFirestoreBatch: vi.fn(),
    forceGlobalCleanup: vi.fn(),
}));

describe('useDesignSync Store', () => {
    beforeEach(() => {
        // Reset store state if needed, though zustand keeps state across tests if not handled
        useDesignSync.setState({
            drawingMode: 'none',
            currentDrawingPoints: [],
            snappedPoint: null,
        });
    });

    it('should update drawing mode and clear points', () => {
        useDesignSync.getState().setDrawingMode('polyline');
        expect(useDesignSync.getState().drawingMode).toBe('polyline');
        expect(useDesignSync.getState().currentDrawingPoints).toEqual([]);
    });

    it('should add drawing points', () => {
        const lat = 10;
        const lng = 20;
        useDesignSync.getState().addDrawingPoint(lat, lng);
        expect(useDesignSync.getState().currentDrawingPoints).toEqual([[lng, lat]]);
    });

    it('should handle snapshots and snapping state', () => {
        const p = { x: 100, y: 200, id: 'test-node' };
        useDesignSync.getState().setSnappedPoint(p);
        expect(useDesignSync.getState().snappedPoint).toEqual(p);

        useDesignSync.getState().setSnappedPoint(null);
        expect(useDesignSync.getState().snappedPoint).toBeNull();
    });

    it('should select feature and set editing mode for vectors', () => {
        const featureId = 'test-f-1';
        const mockState: any = {
            features: {
                [featureId]: { id: featureId, geom_type: 'POLYLINE', group_id: 'g1' }
            }
        };
        useDesignSync.setState({ state: mockState });

        useDesignSync.getState().selectFeature(featureId);

        const state = useDesignSync.getState();
        expect(state.selectedFeatureId).toBe(featureId);
        expect(state.editingFeatureId).toBe(featureId); // Vector should trigger editing
    });

    it('should allow switching selection even when editing another feature', () => {
        const f1 = 'f1';
        const f2 = 'f2';
        const mockState: any = {
            features: {
                [f1]: { id: f1, geom_type: 'POLYLINE', group_id: 'g1' },
                [f2]: { id: f2, geom_type: 'POINT', group_id: 'g1' }
            }
        };
        useDesignSync.setState({ state: mockState });

        // 1. Select f1 (Polyline -> Editing)
        useDesignSync.getState().selectFeature(f1);
        expect(useDesignSync.getState().editingFeatureId).toBe(f1);

        // 2. Select f2 (Point)
        useDesignSync.getState().selectFeature(f2);
        expect(useDesignSync.getState().selectedFeatureId).toBe(f2);
        expect(useDesignSync.getState().editingFeatureId).toBeNull(); // Point should clear editing
    });

    it('should ignore selectFeature(null) in move mode', () => {
        useDesignSync.setState({ drawingMode: 'move', selectedFeatureId: 'f1' });

        useDesignSync.getState().selectFeature(null);
        expect(useDesignSync.getState().selectedFeatureId).toBe('f1'); // Should NOT be null
    });
});
