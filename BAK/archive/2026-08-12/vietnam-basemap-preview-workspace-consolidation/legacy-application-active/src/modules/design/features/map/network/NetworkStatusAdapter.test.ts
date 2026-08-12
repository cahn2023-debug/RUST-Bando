import { describe, expect, it } from 'vitest';
import { NetworkStatusAdapter } from './NetworkStatusAdapter';

describe('NetworkStatusAdapter', () => {
    it('ignores realtime events older than the current observedAt', () => {
        const adapter = new NetworkStatusAdapter();

        expect(adapter.applyRealtimeEvent({ entityId: 'node-1', entityType: 'node', status: 'online', observedAt: 200 })).toBe(true);
        expect(adapter.applyRealtimeEvent({ entityId: 'node-1', entityType: 'node', status: 'offline', observedAt: 100 })).toBe(false);

        expect(adapter.getSnapshot().nodes?.['node-1']).toBe('online');
    });

    it('keeps realtime and simulation snapshots separate', () => {
        const adapter = new NetworkStatusAdapter();

        adapter.applyRealtimeEvent({ entityId: 'node-1', entityType: 'node', status: 'online', observedAt: 200 });
        adapter.setSimulationStatus('node', 'node-1', 'offline');

        expect(adapter.getSnapshot().nodes?.['node-1']).toBe('online');
        adapter.setMode('simulation');
        expect(adapter.getSnapshot().nodes?.['node-1']).toBe('offline');
        adapter.resetSimulation();
        expect(adapter.getSnapshot().nodes?.['node-1']).toBeUndefined();
    });

    it('marks disconnected realtime data stale without changing the last status', () => {
        const adapter = new NetworkStatusAdapter();

        adapter.applyRealtimeEvent({ entityId: 'edge-1', entityType: 'edge', status: 'online', observedAt: '2026-07-13T00:00:00Z' });
        adapter.markRealtimeDisconnected();

        expect(adapter.getState().stale).toBe(true);
        expect(adapter.getSnapshot().edges?.['edge-1']).toBe('online');
    });
});

