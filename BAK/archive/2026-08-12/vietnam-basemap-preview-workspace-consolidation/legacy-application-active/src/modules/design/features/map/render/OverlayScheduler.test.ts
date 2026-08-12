import { describe, expect, it, vi } from 'vitest';
import { DirtyFlag } from './overlayTypes';
import { OverlayScheduler } from './OverlayScheduler';

describe('OverlayScheduler', () => {
    it('uses window-bound animation frame functions by default', () => {
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        const originalCancelAnimationFrame = window.cancelAnimationFrame;
        const onFrame = vi.fn();
        const requestFrame = vi.fn(function (this: Window, callback: FrameRequestCallback) {
            if (this !== window) throw new TypeError('Illegal invocation');
            callback(1);
            return 1;
        });
        const cancelFrame = vi.fn(function (this: Window) {
            if (this !== window) throw new TypeError('Illegal invocation');
        });

        window.requestAnimationFrame = requestFrame as any;
        window.cancelAnimationFrame = cancelFrame as any;

        try {
            const scheduler = new OverlayScheduler(onFrame);
            scheduler.schedule(DirtyFlag.Resize);
            expect(onFrame).toHaveBeenCalledWith(DirtyFlag.Resize);
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
        }
    });

    it('coalesces dirty flags into one frame', () => {
        const callbacks: FrameRequestCallback[] = [];
        const onFrame = vi.fn();
        const scheduler = new OverlayScheduler(
            onFrame,
            (callback) => {
                callbacks.push(callback);
                return callbacks.length;
            },
            vi.fn()
        );

        scheduler.schedule(DirtyFlag.Camera);
        scheduler.schedule(DirtyFlag.State);

        expect(callbacks).toHaveLength(1);
        callbacks[0](1);

        expect(onFrame).toHaveBeenCalledWith(DirtyFlag.Camera | DirtyFlag.State);
    });
});
