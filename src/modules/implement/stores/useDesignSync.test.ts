import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeInvoke } from '../lib/tauri';
import { useDesignSync } from './useDesignSync';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
    emit: vi.fn(),
    listen: vi.fn(),
}));

vi.mock('../lib/tauri', () => ({
    safeInvoke: vi.fn(),
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
        vi.useRealTimers();
        vi.mocked(safeInvoke).mockReset();
        // Reset store state if needed, though zustand keeps state across tests if not handled
        useDesignSync.setState({
            projectId: null,
            projectKey: null,
            state: null,
            pendingSync: false,
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

    it('should batch queued persists and resolve every caller', async () => {
        vi.useFakeTimers();
        vi.mocked(safeInvoke).mockResolvedValue({
            success: true,
            last_event_id: 'evt-2',
            applied_events: [],
            side_effects: [],
        });

        useDesignSync.setState({
            projectId: 'project-1',
            projectKey: 'id:project-1',
            state: {
                regions: {},
                layers: {},
                feature_groups: {},
                features: {},
                settings: {},
            },
        });

        const first = useDesignSync.getState().queueEvent({
            type: 'SettingsUpdated',
            payload: { settings: { a: 1 } },
        });
        const second = useDesignSync.getState().queueEvent({
            type: 'SettingsUpdated',
            payload: { settings: { b: 2 } },
        });

        expect(safeInvoke).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(150);
        await Promise.all([first, second]);

        expect(safeInvoke).toHaveBeenCalledTimes(1);
        const [, args] = vi.mocked(safeInvoke).mock.calls[0];
        expect((args as any).events).toHaveLength(2);
        expect(useDesignSync.getState().pendingSync).toBe(false);
    });

    it('should flush queued persists immediately', async () => {
        vi.useFakeTimers();
        vi.mocked(safeInvoke).mockResolvedValue({
            success: true,
            last_event_id: 'evt-1',
            applied_events: [],
            side_effects: [],
        });

        useDesignSync.setState({
            projectId: 'project-1',
            projectKey: 'id:project-1',
            state: {
                regions: {},
                layers: {},
                feature_groups: {},
                features: {},
                settings: {},
            },
        });

        const pending = useDesignSync.getState().queueEvent({
            type: 'SettingsUpdated',
            payload: { settings: { flushed: true } },
        });

        await useDesignSync.getState().flushPendingPersists();
        await pending;

        expect(safeInvoke).toHaveBeenCalledTimes(1);
        const [, args] = vi.mocked(safeInvoke).mock.calls[0];
        expect((args as any).events).toHaveLength(1);
        expect(useDesignSync.getState().pendingSync).toBe(false);
    });
});
