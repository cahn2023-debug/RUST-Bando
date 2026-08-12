import type { CameraSnapshot } from './overlayTypes';

export type CameraListener = (snapshot: CameraSnapshot) => void;

export class CameraBridge {
    private snapshot: CameraSnapshot | null = null;
    private listeners = new Set<CameraListener>();
    private version = 0;

    publish(input: Omit<CameraSnapshot, 'version'>): CameraSnapshot {
        const snapshot: CameraSnapshot = {
            ...input,
            matrix: new Float32Array(input.matrix),
            version: ++this.version,
        };
        this.snapshot = snapshot;
        this.listeners.forEach(listener => listener(snapshot));
        return snapshot;
    }

    getSnapshot(): CameraSnapshot | null {
        return this.snapshot;
    }

    subscribe(listener: CameraListener): () => void {
        this.listeners.add(listener);
        if (this.snapshot) listener(this.snapshot);
        return () => {
            this.listeners.delete(listener);
        };
    }
}

