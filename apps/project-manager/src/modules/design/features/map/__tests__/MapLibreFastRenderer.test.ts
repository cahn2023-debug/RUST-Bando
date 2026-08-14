import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    FIRST_BATCH_SIZE,
    processFeatureBatches,
    RAF_BUDGET_MS,
    renderFeaturesBatched,
    type BatchProgress,
} from '../progressiveRender';
import type { MapLibreRenderFeature, MapLibreRenderFeatureCollection } from '../mapLibreFastTypes';
import { getStartupReport, resetTelemetry } from '../mapStartupTelemetry';

/**
 * These tests exercise the progressive batch rendering logic extracted from
 * MapLibreFastRenderer (tasks 4.1, 4.2, 4.5). The React component wires this
 * module to the MapLibre source; the pure logic is tested here directly.
 */

const makeFeatures = (count: number): MapLibreRenderFeature[] =>
    Array.from({ length: count }, (_, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [i, i] },
        properties: {
            id: `feature-${i}`,
            groupId: null,
            layerId: 'layer-1',
            name: `Feature ${i}`,
            geomType: 'point',
            color: '#10b981',
            size: 8,
            selected: false,
        },
    }));

const collectedIds = (collections: MapLibreRenderFeatureCollection[]) =>
    collections.flatMap(c => c.features.map(f => (f.properties as { id: string }).id));

describe('progressive render (MapLibreFastRenderer)', () => {
    let rafCallbacks: Array<() => void>;

    const scheduleRaf = (fn: () => void): number => {
        rafCallbacks.push(fn);
        return rafCallbacks.length;
    };

    const flushRaf = () => {
        while (rafCallbacks.length > 0) {
            const cb = rafCallbacks.shift()!;
            cb();
        }
    };

    /** Monotonic clock that advances a fixed step per call — simulates real time passing inside a synchronous loop. */
    const steppingClock = (stepMs: number) => {
        let t = 0;
        return { now: () => (t += stepMs), value: () => t };
    };

    beforeEach(() => {
        rafCallbacks = [];
        resetTelemetry();
        vi.clearAllMocks();
    });

    it('renders all N features — the final collection contains every feature exactly once', () => {
        const features = makeFeatures(500);
        const setData = vi.fn<(c: MapLibreRenderFeatureCollection) => void>();
        const onComplete = vi.fn();

        renderFeaturesBatched({ features, setData, onComplete, scheduleRaf });
        flushRaf();

        expect(onComplete).toHaveBeenCalledTimes(1);

        // The final authoritative write is the complete collection — no duplicates, no gaps.
        const finalCall = setData.mock.calls[setData.mock.calls.length - 1][0];
        const finalIds = finalCall.features.map(f => (f.properties as { id: string }).id);
        expect(finalIds).toHaveLength(500);
        expect(new Set(finalIds).size).toBe(500);

        // Every feature appears in at least one write — nothing dropped along the way.
        const allIds = new Set(collectedIds(setData.mock.calls.map(([c]) => c)));
        expect(allIds.size).toBe(500);
    });

    it('sets the first batch synchronously (≤ 200 features) before any RAF is scheduled', () => {
        const features = makeFeatures(500);
        const setData = vi.fn<(c: MapLibreRenderFeatureCollection) => void>();

        renderFeaturesBatched({ features, setData, scheduleRaf });

        // First setData happens synchronously — before any RAF callback runs.
        expect(setData).toHaveBeenCalledTimes(1);
        const firstBatch = setData.mock.calls[0][0].features;
        expect(firstBatch.length).toBe(FIRST_BATCH_SIZE);
        expect(firstBatch.length).toBeLessThanOrEqual(200);

        // Remaining work is scheduled but not yet executed.
        expect(rafCallbacks.length).toBe(1);
        expect(collectedIds([setData.mock.calls[0][0]])).toHaveLength(200);
    });

    it('reports progress and completes only after the final batch', () => {
        const features = makeFeatures(250); // 200 first + 50 remaining
        const setData = vi.fn<(c: MapLibreRenderFeatureCollection) => void>();
        const onComplete = vi.fn();
        const progress: BatchProgress[] = [];

        renderFeaturesBatched({
            features,
            setData,
            onComplete,
            onProgress: (p) => progress.push({ ...p }),
            scheduleRaf,
        });

        // First batch only — not complete yet.
        expect(onComplete).not.toHaveBeenCalled();
        expect(progress[0]).toEqual({ rendered: 200, total: 250 });

        flushRaf();

        // Final batch done — onComplete invoked and progress reports full totals.
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(progress[progress.length - 1]).toEqual({ rendered: 250, total: 250 });
    });

    it('calls onComplete immediately when everything fits in the first batch', () => {
        const features = makeFeatures(50);
        const setData = vi.fn<(c: MapLibreRenderFeatureCollection) => void>();
        const onComplete = vi.fn();

        renderFeaturesBatched({ features, setData, onComplete, scheduleRaf });

        expect(setData).toHaveBeenCalledTimes(1);
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(rafCallbacks.length).toBe(0); // nothing scheduled
    });

    it('processFeatureBatches yields across frames when the RAF time budget is exceeded', () => {
        const clock = steppingClock(5); // 5ms per feature
        const features = makeFeatures(100);
        const onComplete = vi.fn();
        const progress: BatchProgress[] = [];

        // Budget is 12ms — exceeded after 2 items (frameStart=5, checks at 10/15/20).
        processFeatureBatches({
            features,
            startIndex: 0,
            onComplete,
            onProgress: (p) => progress.push({ ...p }),
            rafBudgetMs: RAF_BUDGET_MS,
            scheduleRaf,
            now: clock.now,
        });

        expect(onComplete).not.toHaveBeenCalled();
        expect(progress).toContainEqual({ rendered: 2, total: 100 });

        // Resume — remaining work runs to completion across further frames.
        while (rafCallbacks.length > 0) {
            const cb = rafCallbacks.shift()!;
            cb();
        }

        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(progress[progress.length - 1]).toEqual({ rendered: 100, total: 100 });
    });

    it('records a RAF violation when a processing frame exceeds the frame budget', () => {
        const clock = steppingClock(20); // 20ms per feature — frame overruns 16ms quickly
        const features = makeFeatures(100);
        const onComplete = vi.fn();

        // Budget is 12ms; frameStart=20, first check at 40 → 20ms elapsed (>16ms) → violation recorded.
        processFeatureBatches({
            features,
            startIndex: 0,
            onComplete,
            rafBudgetMs: RAF_BUDGET_MS,
            scheduleRaf,
            now: clock.now,
        });

        const report = getStartupReport();
        expect(report.rafViolations.length).toBeGreaterThanOrEqual(1);
        expect(report.rafViolations[0].durationMs).toBeGreaterThan(16);
    });
});
