import { create } from 'zustand';
import type { NetworkStatusSnapshot, NetworkEntityStatus } from './NetworkGraphService';

export interface TelemetryEvent {
    entityId: string;
    entityType: 'node' | 'edge';
    status: NetworkEntityStatus;
    observedAt: number;
}

export interface EntityData {
    status: NetworkEntityStatus;
    observedAt: number;
}

interface NetworkStatusState {
    mode: 'realtime' | 'simulation';
    isStale: boolean;
    realtimeData: {
        nodes: Record<string, EntityData>;
        edges: Record<string, EntityData>;
    };
    simulationData: NetworkStatusSnapshot;
    setMode: (mode: 'realtime' | 'simulation') => void;
    receiveEvent: (event: TelemetryEvent) => void;
    markRealtimeDisconnected: () => void;
    simulateEvent: (entityId: string, entityType: 'node' | 'edge', status: NetworkEntityStatus) => void;
    resetSimulation: () => void;
    getSnapshot: () => NetworkStatusSnapshot;
}

export const useNetworkStatusStore = create<NetworkStatusState>((set, get) => ({
    mode: 'realtime',
    isStale: true,
    realtimeData: { nodes: {}, edges: {} },
    simulationData: { nodes: {}, edges: {} },
    
    setMode: (mode) => {
        set({ mode });
        if (mode === 'simulation') {
            get().resetSimulation();
        }
    },
    
    receiveEvent: (event) => {
        set((state) => {
            const data = state.realtimeData;
            const collection = event.entityType === 'node' ? 'nodes' : 'edges';
            const currentData = data[collection][event.entityId];
            
            if (currentData && currentData.observedAt > event.observedAt) {
                return state;
            }

            return {
                isStale: false,
                realtimeData: {
                    ...data,
                    [collection]: {
                        ...data[collection],
                        [event.entityId]: {
                            status: event.status,
                            observedAt: event.observedAt
                        }
                    }
                }
            };
        });
    },

    markRealtimeDisconnected: () => {
        set({ isStale: true });
    },
    
    simulateEvent: (entityId, entityType, status) => {
        set((state) => {
            const data = state.simulationData;
            const collection = entityType === 'node' ? 'nodes' : 'edges';
            return {
                simulationData: {
                    ...data,
                    [collection]: {
                        ...data[collection],
                        [entityId]: status
                    }
                }
            };
        });
    },
    
    resetSimulation: () => {
        set((state) => {
            const snap: NetworkStatusSnapshot = { nodes: {}, edges: {} };
            for (const [id, data] of Object.entries(state.realtimeData.nodes)) {
                snap.nodes![id] = data.status;
            }
            for (const [id, data] of Object.entries(state.realtimeData.edges)) {
                snap.edges![id] = data.status;
            }
            return { simulationData: snap };
        });
    },
    
    getSnapshot: () => {
        const state = get();
        if (state.mode === 'realtime') {
            const snap: NetworkStatusSnapshot = { nodes: {}, edges: {} };
            for (const [id, data] of Object.entries(state.realtimeData.nodes)) {
                snap.nodes![id] = data.status;
            }
            for (const [id, data] of Object.entries(state.realtimeData.edges)) {
                snap.edges![id] = data.status;
            }
            return snap;
        }
        return state.simulationData;
    }
}));
