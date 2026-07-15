import type { NetworkEntityStatus, NetworkStatusSnapshot } from './NetworkGraphService';

export type NetworkStatusMode = 'realtime' | 'simulation';
export type NetworkEntityType = 'node' | 'edge';

export interface NetworkStatusEvent {
    entityId: string;
    entityType: NetworkEntityType;
    status: NetworkEntityStatus;
    observedAt: string | number | Date;
}

export interface NetworkStatusState {
    mode: NetworkStatusMode;
    realtime: NetworkStatusSnapshot;
    simulation: NetworkStatusSnapshot;
    observedAt: Record<string, number>;
    stale: boolean;
}

const emptySnapshot = (): NetworkStatusSnapshot => ({ nodes: {}, edges: {} });

const toTimestamp = (value: string | number | Date): number => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const cloneSnapshot = (snapshot: NetworkStatusSnapshot): NetworkStatusSnapshot => ({
    nodes: { ...(snapshot.nodes || {}) },
    edges: { ...(snapshot.edges || {}) },
});

export class NetworkStatusAdapter {
    private state: NetworkStatusState = {
        mode: 'realtime',
        realtime: emptySnapshot(),
        simulation: emptySnapshot(),
        observedAt: {},
        stale: false,
    };

    getState(): NetworkStatusState {
        return {
            mode: this.state.mode,
            realtime: cloneSnapshot(this.state.realtime),
            simulation: cloneSnapshot(this.state.simulation),
            observedAt: { ...this.state.observedAt },
            stale: this.state.stale,
        };
    }

    getSnapshot(): NetworkStatusSnapshot {
        return cloneSnapshot(this.state.mode === 'simulation' ? this.state.simulation : this.state.realtime);
    }

    setMode(mode: NetworkStatusMode): void {
        this.state = { ...this.state, mode };
    }

    applyRealtimeEvent(event: NetworkStatusEvent): boolean {
        const observedAt = toTimestamp(event.observedAt);
        const key = `${event.entityType}:${event.entityId}`;
        const previousObservedAt = this.state.observedAt[key] || 0;
        if (observedAt < previousObservedAt) return false;

        const realtime = cloneSnapshot(this.state.realtime);
        const bucket = event.entityType === 'node' ? 'nodes' : 'edges';
        realtime[bucket] = { ...(realtime[bucket] || {}), [event.entityId]: event.status };

        this.state = {
            ...this.state,
            realtime,
            observedAt: { ...this.state.observedAt, [key]: observedAt },
            stale: false,
        };
        return true;
    }

    markRealtimeDisconnected(): void {
        this.state = { ...this.state, stale: true };
    }

    setSimulationStatus(entityType: NetworkEntityType, entityId: string, status: NetworkEntityStatus): void {
        const simulation = cloneSnapshot(this.state.simulation);
        const bucket = entityType === 'node' ? 'nodes' : 'edges';
        simulation[bucket] = { ...(simulation[bucket] || {}), [entityId]: status };
        this.state = { ...this.state, simulation };
    }

    resetSimulation(): void {
        this.state = { ...this.state, simulation: emptySnapshot() };
    }
}

