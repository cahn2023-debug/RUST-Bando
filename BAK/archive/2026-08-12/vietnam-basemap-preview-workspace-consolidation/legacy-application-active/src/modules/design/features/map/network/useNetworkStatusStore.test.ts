import { describe, it, expect, beforeEach } from 'vitest';
import { useNetworkStatusStore } from './useNetworkStatusStore';

describe('useNetworkStatusStore', () => {
    beforeEach(() => {
        // Reset the store before each test
        useNetworkStatusStore.setState({
            mode: 'realtime',
            isStale: true,
            realtimeData: { nodes: {}, edges: {} },
            simulationData: { nodes: {}, edges: {} }
        });
    });

    it('should initialize with default state', () => {
        const state = useNetworkStatusStore.getState();
        expect(state.mode).toBe('realtime');
        expect(state.isStale).toBe(true);
        expect(state.realtimeData).toEqual({ nodes: {}, edges: {} });
    });

    it('should receive a realtime event and update state', () => {
        const store = useNetworkStatusStore.getState();
        
        store.receiveEvent({
            entityId: 'node1',
            entityType: 'node',
            status: 'online',
            observedAt: 1000
        });

        const state = useNetworkStatusStore.getState();
        expect(state.isStale).toBe(false);
        expect(state.realtimeData.nodes['node1']).toEqual({
            status: 'online',
            observedAt: 1000
        });
    });

    it('should ignore stale events', () => {
        const store = useNetworkStatusStore.getState();
        
        store.receiveEvent({
            entityId: 'node1',
            entityType: 'node',
            status: 'online',
            observedAt: 1000
        });

        // This event should be ignored because observedAt (500) is less than current (1000)
        useNetworkStatusStore.getState().receiveEvent({
            entityId: 'node1',
            entityType: 'node',
            status: 'offline',
            observedAt: 500
        });

        const state = useNetworkStatusStore.getState();
        expect(state.realtimeData.nodes['node1'].status).toBe('online');
    });

    it('should accept newer events', () => {
        const store = useNetworkStatusStore.getState();
        
        store.receiveEvent({
            entityId: 'node1',
            entityType: 'node',
            status: 'online',
            observedAt: 1000
        });

        useNetworkStatusStore.getState().receiveEvent({
            entityId: 'node1',
            entityType: 'node',
            status: 'offline',
            observedAt: 2000
        });

        const state = useNetworkStatusStore.getState();
        expect(state.realtimeData.nodes['node1'].status).toBe('offline');
        expect(state.realtimeData.nodes['node1'].observedAt).toBe(2000);
    });

    it('should mark realtime as disconnected and stale', () => {
        const store = useNetworkStatusStore.getState();
        store.receiveEvent({
            entityId: 'node1',
            entityType: 'node',
            status: 'online',
            observedAt: 1000
        });

        expect(useNetworkStatusStore.getState().isStale).toBe(false);

        useNetworkStatusStore.getState().markRealtimeDisconnected();

        const state = useNetworkStatusStore.getState();
        expect(state.isStale).toBe(true);
        // Data should remain intact
        expect(state.realtimeData.nodes['node1'].status).toBe('online');
    });

    it('should reset simulation data to realtime data when entering simulation mode', () => {
        const store = useNetworkStatusStore.getState();
        store.receiveEvent({
            entityId: 'node1',
            entityType: 'node',
            status: 'online',
            observedAt: 1000
        });
        store.receiveEvent({
            entityId: 'edge1',
            entityType: 'edge',
            status: 'offline',
            observedAt: 1000
        });

        useNetworkStatusStore.getState().setMode('simulation');

        const state = useNetworkStatusStore.getState();
        expect(state.mode).toBe('simulation');
        expect(state.simulationData.nodes?.['node1']).toBe('online');
        expect(state.simulationData.edges?.['edge1']).toBe('offline');
    });

    it('should allow simulating events without affecting realtime data', () => {
        const store = useNetworkStatusStore.getState();
        store.receiveEvent({
            entityId: 'node1',
            entityType: 'node',
            status: 'online',
            observedAt: 1000
        });

        store.setMode('simulation');
        
        useNetworkStatusStore.getState().simulateEvent('node1', 'node', 'offline');

        const state = useNetworkStatusStore.getState();
        
        // Simulation data is updated
        expect(state.simulationData.nodes?.['node1']).toBe('offline');
        
        // Realtime data is untouched
        expect(state.realtimeData.nodes['node1'].status).toBe('online');
    });

    it('should return the correct snapshot depending on mode', () => {
        const store = useNetworkStatusStore.getState();
        store.receiveEvent({
            entityId: 'node1',
            entityType: 'node',
            status: 'online',
            observedAt: 1000
        });

        // In realtime mode
        let snap = useNetworkStatusStore.getState().getSnapshot();
        expect(snap.nodes?.['node1']).toBe('online');

        // Switch to simulation and change simulation state
        store.setMode('simulation');
        useNetworkStatusStore.getState().simulateEvent('node1', 'node', 'offline');

        snap = useNetworkStatusStore.getState().getSnapshot();
        expect(snap.nodes?.['node1']).toBe('offline');
    });
});
