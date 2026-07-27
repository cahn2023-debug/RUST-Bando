import { beforeEach, describe, expect, it } from 'vitest';
import { buildRenderMetrics, resetRenderMetricSamples } from './mapRenderMetrics';

describe('mapRenderMetrics', () => {
    beforeEach(() => resetRenderMetricSamples());

    it('tracks rolling p50 and p95 frame samples', () => {
        [1, 2, 3, 4, 20].forEach(frameMs => buildRenderMetrics({
            engine: 'maplibre-fast',
            lodLevel: 'detail',
            featureCount: 100,
            frameMs,
        }));

        const metrics = buildRenderMetrics({
            engine: 'maplibre-fast',
            lodLevel: 'detail',
            featureCount: 100,
            frameMs: 5,
        });

        expect(metrics.sampleCount).toBe(6);
        expect(metrics.p50FrameMs).toBe(3);
        expect(metrics.p95FrameMs).toBe(5);
    });
});
