import { DirtyFlag } from './overlayTypes';

export type OverlayFrameCallback = (dirty: DirtyFlag) => void;

export class OverlayScheduler {
    private rafId = 0;
    private dirty = DirtyFlag.None;

    constructor(
        private readonly onFrame: OverlayFrameCallback,
        private readonly requestFrame: typeof requestAnimationFrame = (callback) => window.requestAnimationFrame(callback),
        private readonly cancelFrame: typeof cancelAnimationFrame = (id) => window.cancelAnimationFrame(id)
    ) {}

    schedule(flag: DirtyFlag): void {
        this.dirty |= flag;
        if (this.rafId) return;

        this.rafId = this.requestFrame(() => {
            const dirty = this.dirty;
            this.rafId = 0;
            this.dirty = DirtyFlag.None;
            if (dirty !== DirtyFlag.None) this.onFrame(dirty);
        });
    }

    flush(): void {
        if (!this.rafId) return;
        this.cancelFrame(this.rafId);
        const dirty = this.dirty;
        this.rafId = 0;
        this.dirty = DirtyFlag.None;
        if (dirty !== DirtyFlag.None) this.onFrame(dirty);
    }

    dispose(): void {
        if (this.rafId) this.cancelFrame(this.rafId);
        this.rafId = 0;
        this.dirty = DirtyFlag.None;
    }
}
