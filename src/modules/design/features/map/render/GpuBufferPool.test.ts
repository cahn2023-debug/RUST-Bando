import { describe, expect, it } from 'vitest';
import { GpuBufferPool } from './GpuBufferPool';

describe('GpuBufferPool', () => {
    it('reuses freed byte ranges', () => {
        const pool = new GpuBufferPool('points');
        const first = pool.allocate(10, 1);
        const second = pool.allocate(16, 1);

        pool.free(first);
        const reused = pool.allocate(8, 1);

        expect(reused.byteOffset).toBe(first.byteOffset);
        expect(second.byteOffset).toBeGreaterThan(reused.byteOffset);
    });
});

