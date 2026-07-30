import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { safeInvoke } from '../lib/tauri';
import { useDesignSync } from './useDesignSync';

const parseMetadata = (value: unknown) => (
    typeof value === 'string' ? JSON.parse(value) : value as Record<string, unknown>
);

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
        vi.mocked(tauriInvoke).mockReset();
        // Reset store state if needed, though zustand keeps state across tests if not handled
        useDesignSync.setState({
            projectId: null,
            projectKey: null,
            state: null,
            pendingSync: false,
            visibleFeatures: {},
            visibleFeatureIds: [],
            featureDetailsCache: {},
            viewportRevision: 0,
            drawingMode: 'none',
            editingFeatureId: null,
            selectedFeatureId: null,
            hoverId: null,
            previewMetadata: null,
            selectionSet: new Set(),
            boxSelection: null,
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

    it('should force reload even when the same project is already loading', async () => {
        vi.mocked(safeInvoke).mockImplementation(async (command: string) => {
            if (command === 'get_active_project') {
                return { id: 'project-1' };
            }
            if (command === 'load_design_state_v2') {
                return {
                    regions: {},
                    layers: {},
                    feature_groups: {},
                    features: {},
                    settings: {},
                };
            }
            return null;
        });

        useDesignSync.setState({
            projectId: 'project-1',
            projectPath: 'C:/workspace/project.pmp',
            projectKey: 'C:/workspace/project.pmp',
            isLoading: true,
            isHydrating: true,
            state: {
                regions: {},
                layers: {},
                feature_groups: {},
                features: {},
                settings: {},
            },
        });

        await useDesignSync.getState().initialize('project-1', 'C:/workspace/project.pmp', { forceReload: true });

        expect(safeInvoke).toHaveBeenCalledWith(
            'load_design_state_v2',
            expect.objectContaining({
                project_id: 'project-1',
            })
        );
        expect(useDesignSync.getState().isLoading).toBe(false);
        expect(useDesignSync.getState().isHydrating).toBe(false);
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

    it('should ignore sparse default feature ack fields that would erase intersection child state', () => {
        useDesignSync.setState({
            state: {
                regions: {},
                layers: {},
                feature_groups: {},
                settings: {},
                features: {
                    'camera-1': {
                        id: 'camera-1',
                        layer_id: 'layer-a',
                        group_id: 'group-a',
                        name: 'Camera 1',
                        geom_type: 'POINT',
                        coordinates: [105.62984, 21.00289],
                        properties: { icon: 'cctv', iconKey: 'cctv', type: 'camera' },
                        metadata: JSON.stringify({ parent_feature_id: 'intersection-1', specs: { hfov: 70 } }),
                        is_visible: true,
                    },
                },
            },
        });

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'ack-1',
            applied_event: {
                type: 'FeatureUpdated',
                payload: {
                    id: 'camera-1',
                    layer_id: 'layer-b',
                    group_id: 'group-b',
                    geom_type: 'LineString',
                    metadata: JSON.stringify({ media: {}, gis: {}, business: {}, specs: {} }),
                    properties: { icon: 'default', iconKey: 'default', type: 'point' },
                },
            },
            side_effects: [],
        });

        const feature = useDesignSync.getState().state!.features['camera-1'];
        expect(feature.layer_id).toBe('layer-b');
        expect(feature.group_id).toBe('group-b');
        expect(feature.geom_type).toBe('POINT');
        expect(feature.properties).toMatchObject({ iconKey: 'cctv', type: 'camera' });
        expect(parseMetadata(feature.metadata)).toMatchObject({
            parent_feature_id: 'intersection-1',
        });
    });

    it('should preserve intersection parent metadata on metadata-only feature updates', () => {
        useDesignSync.setState({
            state: {
                regions: {},
                layers: {},
                feature_groups: {},
                settings: {},
                features: {
                    'camera-1': {
                        id: 'camera-1',
                        layer_id: 'layer-a',
                        group_id: 'group-a',
                        name: 'Camera 1',
                        geom_type: 'POINT',
                        coordinates: [105.62984, 21.00289],
                        properties: { icon: 'cctv', iconKey: 'cctv', type: 'camera' },
                        metadata: JSON.stringify({
                            parent_feature_id: 'intersection-1',
                            source_parent_feature_id: 'source-intersection-1',
                            snap_links: { v0: 'intersection-1' },
                            network: { from_feature_id: 'node-a' },
                            start_node_id: 'node-a',
                            end_node_id: 'node-b',
                            specs: { hfov: 70 },
                        }),
                        is_visible: true,
                    },
                },
            },
        });

        useDesignSync.getState().applyEventsOptimistically([{
            type: 'FeatureUpdated',
            payload: {
                id: 'camera-1',
                metadata: JSON.stringify({ description: 'updated only' }),
            },
        }]);

        const feature = useDesignSync.getState().state!.features['camera-1'];
        expect(parseMetadata(feature.metadata)).toMatchObject({
            description: 'updated only',
            parent_feature_id: 'intersection-1',
            source_parent_feature_id: 'source-intersection-1',
            snap_links: { v0: 'intersection-1' },
            network: { from_feature_id: 'node-a' },
            start_node_id: 'node-a',
            end_node_id: 'node-b',
        });
    });

    it('should still apply explicit feature ack geometry and properties changes', () => {
        useDesignSync.setState({
            state: {
                regions: {},
                layers: {},
                feature_groups: {},
                settings: {},
                features: {
                    'camera-1': {
                        id: 'camera-1',
                        layer_id: 'layer-a',
                        group_id: 'group-a',
                        name: 'Camera 1',
                        geom_type: 'POINT',
                        coordinates: [105.62984, 21.00289],
                        properties: { icon: 'cctv', iconKey: 'cctv', type: 'camera' },
                        metadata: JSON.stringify({ parent_feature_id: 'intersection-1' }),
                        is_visible: true,
                    },
                },
            },
        });

        useDesignSync.getState().applyQueuedAckToState({
            success: true,
            event_id: 'ack-2',
            applied_event: {
                type: 'FeatureUpdated',
                payload: {
                    id: 'camera-1',
                    coordinates: [105.7, 21.1],
                    properties: { icon: 'camera-new', iconKey: 'camera-new', type: 'camera' },
                },
            },
            side_effects: [],
        });

        const feature = useDesignSync.getState().state!.features['camera-1'];
        expect(feature.coordinates).toEqual([105.7, 21.1]);
        expect(feature.properties).toEqual({ icon: 'camera-new', iconKey: 'camera-new', type: 'camera' });
    });

    it('should sync optimistic feature theme updates into viewport caches', () => {
        const feature: any = {
            id: 'camera-1',
            layer_id: 'layer-a',
            group_id: 'group-a',
            name: 'Camera 1',
            geom_type: 'POINT',
            coordinates: [105.62984, 21.00289],
            properties: { icon: 'cctv', iconKey: 'cctv', type: 'cctv' },
            metadata: JSON.stringify({ icon: 'cctv', color: '#3B82F6', size: 32 }),
            is_visible: true,
        };

        useDesignSync.setState({
            state: {
                regions: {},
                layers: {},
                feature_groups: {},
                settings: {},
                features: { 'camera-1': feature },
            },
            visibleFeatures: { 'camera-1': feature },
            visibleFeatureIds: ['camera-1'],
            featureDetailsCache: { 'camera-1': feature },
        });

        useDesignSync.getState().applyEventsOptimistically([{
            type: 'FeatureUpdated',
            payload: {
                id: 'camera-1',
                metadata: JSON.stringify({ icon: 'ptz', color: '#F59E0B', size: 18, type: 'ptz' }),
                properties: { icon: 'ptz', iconKey: 'ptz', type: 'ptz' },
            },
        }]);

        const store = useDesignSync.getState();
        const stateFeature = store.state!.features['camera-1'];
        const visibleFeature = store.visibleFeatures['camera-1'];
        const cachedFeature = store.featureDetailsCache['camera-1'];

        expect(parseMetadata(stateFeature.metadata)).toMatchObject({ icon: 'ptz', color: '#F59E0B', size: 18 });
        expect(parseMetadata(visibleFeature.metadata)).toMatchObject({ icon: 'ptz', color: '#F59E0B', size: 18 });
        expect(parseMetadata(cachedFeature.metadata)).toMatchObject({ icon: 'ptz', color: '#F59E0B', size: 18 });
        expect(visibleFeature.properties).toEqual({ icon: 'ptz', iconKey: 'ptz', type: 'ptz' });
        expect(cachedFeature.properties).toEqual({ icon: 'ptz', iconKey: 'ptz', type: 'ptz' });
    });

    it('should apply feature updates using a visible-only feature as the canonical source', () => {
        const feature: any = {
            id: 'visible-only-1',
            layer_id: 'layer-a',
            group_id: 'group-a',
            name: 'Visible Only',
            geom_type: 'POINT',
            coordinates: [105.62984, 21.00289],
            properties: { icon: 'intersection', iconKey: 'intersection', type: 'intersection' },
            metadata: JSON.stringify({ icon: 'intersection', display_order: '23', source_parent_feature_id: 'root-1' }),
            is_visible: true,
        };

        useDesignSync.setState({
            state: {
                regions: {},
                layers: {},
                feature_groups: {},
                settings: {},
                features: {},
            },
            visibleFeatures: { 'visible-only-1': feature },
            visibleFeatureIds: ['visible-only-1'],
            featureDetailsCache: {},
        });

        useDesignSync.getState().applyEventsOptimistically([{
            type: 'FeatureUpdated',
            payload: {
                id: 'visible-only-1',
                name: 'Saved From Panel',
                metadata: JSON.stringify({ description: 'panel edit', icon: 'ptz' }),
                properties: { icon: 'ptz', iconKey: 'ptz', type: 'ptz' },
            },
        }]);

        const store = useDesignSync.getState();
        const stateFeature = store.state!.features['visible-only-1'];
        const visibleFeature = store.visibleFeatures['visible-only-1'];
        const cachedFeature = store.featureDetailsCache['visible-only-1'];

        expect(stateFeature.id).toBe('visible-only-1');
        expect(stateFeature.layer_id).toBe('layer-a');
        expect(stateFeature.coordinates).toEqual([105.62984, 21.00289]);
        expect(parseMetadata(stateFeature.metadata)).toMatchObject({
            description: 'panel edit',
            source_parent_feature_id: 'root-1',
        });
        expect(visibleFeature).toEqual(stateFeature);
        expect(cachedFeature).toEqual(stateFeature);
    });

    it('should apply queued ack updates from feature detail cache without creating a partial feature', () => {
        const feature: any = {
            id: 'cached-only-1',
            layer_id: 'layer-a',
            group_id: 'group-a',
            name: 'Cached Only',
            geom_type: 'POINT',
            coordinates: [105.7, 21.1],
            properties: { icon: 'cctv', iconKey: 'cctv', type: 'camera' },
            metadata: JSON.stringify({ icon: 'cctv', network: { role: 'device' } }),
            is_visible: true,
        };

        useDesignSync.setState({
            state: {
                regions: {},
                layers: {},
                feature_groups: {},
                settings: {},
                features: {},
            },
            visibleFeatures: {},
            visibleFeatureIds: [],
            featureDetailsCache: { 'cached-only-1': feature },
        });

        useDesignSync.getState().applyQueuedAckToState({
            success: true,
            event_id: 'ack-cached',
            applied_event: {
                type: 'FeatureUpdated',
                payload: {
                    id: 'cached-only-1',
                    metadata: JSON.stringify({ description: 'ack edit' }),
                },
            },
            side_effects: [],
        });

        const store = useDesignSync.getState();
        const stateFeature = store.state!.features['cached-only-1'];
        const cachedFeature = store.featureDetailsCache['cached-only-1'];

        expect(stateFeature.id).toBe('cached-only-1');
        expect(stateFeature.layer_id).toBe('layer-a');
        expect(stateFeature.properties).toEqual({ icon: 'cctv', iconKey: 'cctv', type: 'camera' });
        expect(parseMetadata(stateFeature.metadata)).toMatchObject({
            description: 'ack edit',
            network: { role: 'device' },
        });
        expect(cachedFeature).toEqual(stateFeature);
    });

    it('should remove deleted features from viewport caches and selection state', () => {
        const feature: any = {
            id: 'feature-1',
            layer_id: 'layer-1',
            group_id: 'group-1',
            name: 'Camera 1',
            geom_type: 'POINT',
            coordinates: [105.7, 21.1],
            properties: {},
            metadata: '{}',
        };

        useDesignSync.setState({
            state: {
                regions: {},
                layers: { 'layer-1': { id: 'layer-1', region_id: 'region-1', name: 'Layer', is_visible: true } },
                feature_groups: { 'group-1': { id: 'group-1', layer_id: 'layer-1', name: 'Group' } },
                settings: {},
                features: { 'feature-1': feature },
            },
            visibleFeatures: { 'feature-1': feature },
            visibleFeatureIds: ['feature-1'],
            featureDetailsCache: { 'feature-1': feature },
            viewportRevision: 0,
            selectedFeatureId: 'feature-1',
            selectedPopupLocation: [21.1, 105.7],
            editingFeatureId: 'feature-1',
            hoverId: 'feature-1',
            previewMetadata: { id: 'feature-1', metadata: { description: 'draft' } },
            selectionSet: new Set(['feature-1', 'feature-2']),
            boxSelection: {
                count: 1,
                byType: { POINT: 1 },
                items: [{
                    id: 'feature-1',
                    name: 'Camera 1',
                    geomType: 'POINT',
                    displayType: 'Camera',
                    lng: 105.7,
                    lat: 21.1,
                    note: '',
                    groupId: 'group-1',
                }],
                bounds: [21.1, 105.7, 21.1, 105.7],
            },
        });

        useDesignSync.getState().applyEventsOptimistically([{
            type: 'FeatureDeleted',
            payload: { id: 'feature-1' },
        }]);

        const store = useDesignSync.getState();
        expect(store.state!.features['feature-1']).toBeUndefined();
        expect(store.visibleFeatures['feature-1']).toBeUndefined();
        expect(store.visibleFeatureIds).toEqual([]);
        expect(store.featureDetailsCache['feature-1']).toBeUndefined();
        expect(store.viewportRevision).toBe(1);
        expect(store.selectedFeatureId).toBeNull();
        expect(store.selectedPopupLocation).toBeNull();
        expect(store.editingFeatureId).toBeNull();
        expect(store.hoverId).toBeNull();
        expect(store.previewMetadata).toBeNull();
        expect(Array.from(store.selectionSet)).toEqual(['feature-2']);
        expect(store.boxSelection).toBeNull();
    });

    it('should cascade feature group deletes through known child features and groups', () => {
        useDesignSync.setState({
            state: {
                regions: {},
                layers: { 'layer-1': { id: 'layer-1', region_id: 'region-1', name: 'Layer' } },
                feature_groups: {
                    'group-parent': { id: 'group-parent', layer_id: 'layer-1', parent_id: null, name: 'Parent' },
                    'group-child': { id: 'group-child', layer_id: 'layer-1', parent_id: 'group-parent', name: 'Child' },
                },
                settings: {},
                features: {
                    'feature-parent': { id: 'feature-parent', layer_id: 'layer-1', group_id: 'group-parent', name: 'Parent item', geom_type: 'POINT' },
                    'feature-child': { id: 'feature-child', layer_id: 'layer-1', group_id: 'group-child', name: 'Child item', geom_type: 'POINT' },
                    'feature-other': { id: 'feature-other', layer_id: 'layer-1', group_id: null, name: 'Other item', geom_type: 'POINT' },
                },
            } as any,
            visibleFeatures: {
                'feature-parent': {} as any,
                'feature-child': {} as any,
                'feature-other': {} as any,
            },
            visibleFeatureIds: ['feature-parent', 'feature-child', 'feature-other'],
            featureDetailsCache: {
                'feature-parent': {} as any,
                'feature-child': {} as any,
                'feature-other': {} as any,
            },
            viewportRevision: 0,
        });

        useDesignSync.getState().applyEventsOptimistically([{
            type: 'FeatureGroupDeleted',
            payload: { id: 'group-parent' },
        }]);

        const store = useDesignSync.getState();
        expect(store.state!.feature_groups['group-parent']).toBeUndefined();
        expect(store.state!.feature_groups['group-child']).toBeUndefined();
        expect(store.state!.features['feature-parent']).toBeUndefined();
        expect(store.state!.features['feature-child']).toBeUndefined();
        expect(store.state!.features['feature-other']).toBeDefined();
        expect(store.visibleFeatureIds).toEqual(['feature-other']);
        expect(store.viewportRevision).toBe(1);
    });

    it('should cascade layer deletes through known child features and groups', () => {
        useDesignSync.setState({
            state: {
                regions: {},
                layers: {
                    'layer-delete': { id: 'layer-delete', region_id: 'region-1', name: 'Delete' },
                    'layer-keep': { id: 'layer-keep', region_id: 'region-1', name: 'Keep' },
                },
                feature_groups: {
                    'group-delete': { id: 'group-delete', layer_id: 'layer-delete', parent_id: null, name: 'Delete group' },
                    'group-keep': { id: 'group-keep', layer_id: 'layer-keep', parent_id: null, name: 'Keep group' },
                },
                settings: {},
                features: {
                    'feature-delete': { id: 'feature-delete', layer_id: 'layer-delete', group_id: 'group-delete', name: 'Delete item', geom_type: 'POINT' },
                    'feature-keep': { id: 'feature-keep', layer_id: 'layer-keep', group_id: 'group-keep', name: 'Keep item', geom_type: 'POINT' },
                },
            } as any,
            visibleFeatures: {
                'feature-delete': {} as any,
                'feature-keep': {} as any,
            },
            visibleFeatureIds: ['feature-delete', 'feature-keep'],
            featureDetailsCache: {
                'feature-delete': {} as any,
                'feature-keep': {} as any,
            },
            viewportRevision: 0,
        });

        useDesignSync.getState().applyEventsOptimistically([{
            type: 'LayerDeleted',
            payload: { id: 'layer-delete' },
        }]);

        const store = useDesignSync.getState();
        expect(store.state!.layers['layer-delete']).toBeUndefined();
        expect(store.state!.layers['layer-keep']).toBeDefined();
        expect(store.state!.feature_groups['group-delete']).toBeUndefined();
        expect(store.state!.features['feature-delete']).toBeUndefined();
        expect(store.state!.features['feature-keep']).toBeDefined();
        expect(store.visibleFeatureIds).toEqual(['feature-keep']);
        expect(store.viewportRevision).toBe(1);
    });
});
