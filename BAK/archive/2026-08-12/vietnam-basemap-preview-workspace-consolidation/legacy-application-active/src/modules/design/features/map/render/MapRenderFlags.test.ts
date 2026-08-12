import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_RENDER_FLAGS, resolveMapRenderFlags } from './overlayTypes';

describe('resolveMapRenderFlags', () => {
    it('keeps overlay infrastructure on but geometry domains off by default', () => {
        expect(resolveMapRenderFlags()).toEqual(DEFAULT_MAP_RENDER_FLAGS);
        expect(resolveMapRenderFlags().overlayEnabled).toBe(true);
        expect(resolveMapRenderFlags().overlayPoints).toBe(false);
    });

    it('allows domain flags to be enabled independently', () => {
        expect(resolveMapRenderFlags({ overlayPoints: true })).toEqual({
            ...DEFAULT_MAP_RENDER_FLAGS,
            overlayPoints: true,
        });
    });
});

