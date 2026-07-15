/**
 * Event Bus for Point of View (POV) synchronization.
 * Pure TypeScript implementation to avoid framework coupling.
 */

export interface Pov {
    heading: number;
    pitch: number;
    zoom: number;
}

export type PovListener = (pov: Pov) => void;

class PovEventBus {
    private static instance: PovEventBus;
    private listeners: Set<PovListener> = new Set();
    private currentPov: Pov = { heading: 0, pitch: 0, zoom: 1 };

    private constructor() { }

    public static getInstance(): PovEventBus {
        if (!PovEventBus.instance) {
            PovEventBus.instance = new PovEventBus();
        }
        return PovEventBus.instance;
    }

    /**
     * Emit a new POV state to all subscribers.
     */
    public emit(pov: Partial<Pov>): void {
        this.currentPov = { ...this.currentPov, ...pov };
        this.listeners.forEach(listener => listener(this.currentPov));
    }

    /**
     * Subscribe to POV updates.
     */
    public subscribe(listener: PovListener): () => void {
        this.listeners.add(listener);
        // Immediately notify with current state
        listener(this.currentPov);

        // Return unsubscribe function
        return () => {
            this.listeners.delete(listener);
        };
    }

    public getCurrentPov(): Pov {
        return { ...this.currentPov };
    }
}

export const eventBus = PovEventBus.getInstance();
