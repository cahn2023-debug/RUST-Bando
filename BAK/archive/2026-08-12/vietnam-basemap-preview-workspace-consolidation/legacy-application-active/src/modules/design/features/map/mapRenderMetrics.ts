import type { MapRenderEngine, MapRenderMetrics } from './stores/types';
import type { MapLibreLodLevel } from './mapLibreFastTypes';

const MAX_SAMPLES = 120;
const frameSamples: number[] = [];

const percentile = (samples: number[], percentileValue: number) => {
    if (samples.length === 0) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentileValue));
    return sorted[index];
};

export const buildRenderMetrics = ({
    engine,
    lodLevel,
    featureCount,
    viewportQueryMs = 0,
    sourceBuildMs = 0,
    mapLibreSetDataMs = 0,
    frameMs,
}: {
    engine: MapRenderEngine;
    lodLevel: MapLibreLodLevel;
    featureCount: number;
    viewportQueryMs?: number;
    sourceBuildMs?: number;
    mapLibreSetDataMs?: number;
    frameMs: number;
}): MapRenderMetrics => {
    frameSamples.push(frameMs);
    if (frameSamples.length > MAX_SAMPLES) frameSamples.shift();

    return {
        engine,
        lodLevel,
        featureCount,
        viewportQueryMs,
        sourceBuildMs,
        mapLibreSetDataMs,
        frameMs,
        sampleCount: frameSamples.length,
        p50FrameMs: percentile(frameSamples, 0.5),
        p95FrameMs: percentile(frameSamples, 0.95),
    };
};

export const resetRenderMetricSamples = () => {
    frameSamples.length = 0;
};
