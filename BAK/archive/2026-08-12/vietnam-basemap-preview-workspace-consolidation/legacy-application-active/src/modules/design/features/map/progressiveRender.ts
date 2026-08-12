import type { MapLibreRenderFeature, MapLibreRenderFeatureCollection } from './mapLibreFastTypes';
import { recordRAFViolation } from './mapStartupTelemetry';

/**
 * Progressive batch rendering for MapLibreFastRenderer.
 *
 * Splits a large feature collection into a fast synchronous first batch (so the
 * map paints immediately) followed by background batches processed inside a
 * per-frame time budget. Kept as a standalone module so the batching/yielding
 * logic can be unit-tested without mounting the full React renderer.
 *
 * Tasks: 4.1 (progressive loading), 4.2 (RAF time-budget guard), 4.5 (progress).
 */

/** Number of features to render in the first synchronous batch for fast first-paint. (Task 4.1) */
export const FIRST_BATCH_SIZE = 200;

/** RAF time-budget in ms — stop processing batch items when exceeded to keep frames < 16ms. (Task 4.2) */
export const RAF_BUDGET_MS = 12;

/** Frame violation threshold — a processing frame longer than this is recorded as a RAF violation. (Req 7.5) */
export const FRAME_BUDGET_MS = 16;

export interface BatchProgress {
  rendered: number;
  total: number;
}

export type ScheduleRaf = (fn: () => void) => number;
export type NowFn = () => number;

const defaultScheduleRaf: ScheduleRaf = (fn) => requestAnimationFrame(fn);

const defaultNow: NowFn = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

interface BaseBatchOptions {
  onComplete?: () => void;
  onProgress?: (progress: BatchProgress) => void;
  rafBudgetMs?: number;
  scheduleRaf?: ScheduleRaf;
  now?: NowFn;
}

export interface RenderFeaturesBatchedOptions extends BaseBatchOptions {
  features: MapLibreRenderFeature[];
  setData: (collection: MapLibreRenderFeatureCollection) => void;
  onFirstBatch?: () => void;
  firstBatchSize?: number;
}

export interface ProcessFeatureBatchesOptions extends BaseBatchOptions {
  features: MapLibreRenderFeature[];
  startIndex: number;
}

/**
 * Renders `features` progressively.
 *
 * 1. Sets the first `firstBatchSize` features synchronously via `setData`.
 * 2. Invokes `onFirstBatch` (caller emits the `first-feature` milestone).
 * 3. If everything fit in the first batch, invokes `onComplete` and returns.
 * 4. Otherwise schedules `processFeatureBatches` for the remainder, letting the
 *    caller yield across frames without blocking the main thread.
 */
export function renderFeaturesBatched(options: RenderFeaturesBatchedOptions): void {
  const {
    features,
    setData,
    onFirstBatch,
    onComplete,
    onProgress,
    firstBatchSize = FIRST_BATCH_SIZE,
    rafBudgetMs = RAF_BUDGET_MS,
    scheduleRaf = defaultScheduleRaf,
  } = options;

  const total = features.length;
  const firstBatch = features.slice(0, firstBatchSize);

  setData({ type: 'FeatureCollection', features: firstBatch });
  onProgress?.({ rendered: firstBatch.length, total });
  onFirstBatch?.();

  // Everything already fits in the first batch — nothing left to schedule.
  if (total <= firstBatchSize) {
    onProgress?.({ rendered: total, total });
    onComplete?.();
    return;
  }

  const remaining = features.slice(firstBatchSize);
  const wrappedComplete = () => {
    // Final full-collection write so the source ends with every feature exactly once.
    setData({ type: 'FeatureCollection', features });
    onProgress?.({ rendered: total, total });
    onComplete?.();
  };

  scheduleRaf(() => {
    processFeatureBatches({
      features: remaining,
      startIndex: 0,
      onComplete: wrappedComplete,
      onProgress: (progress) => onProgress?.({ rendered: firstBatchSize + progress.rendered, total }),
      rafBudgetMs,
      scheduleRaf,
      now: options.now,
    });
  });
}

/**
 * Processes `features` starting at `startIndex` inside a single RAF time budget.
 *
 * Advances the index while `now() - frameStart <= rafBudgetMs`. When the budget
 * is exceeded the remaining work is rescheduled to the next frame and progress
 * is reported. After the loop, `onComplete` is invoked. Frames longer than
 * `FRAME_BUDGET_MS` are recorded as RAF violations.
 */
export function processFeatureBatches(options: ProcessFeatureBatchesOptions): void {
  const {
    features,
    startIndex,
    onComplete,
    onProgress,
    rafBudgetMs = RAF_BUDGET_MS,
    scheduleRaf = defaultScheduleRaf,
    now = defaultNow,
  } = options;

  const frameStart = now();
  let index = startIndex;
  const processedThisFrame = () => index - startIndex;

  while (index < features.length) {
    if (now() - frameStart > rafBudgetMs) {
      const durationMs = now() - frameStart;
      if (durationMs > FRAME_BUDGET_MS) {
        recordRAFViolation(durationMs, processedThisFrame());
      }
      onProgress?.({ rendered: index, total: features.length });
      scheduleRaf(() => processFeatureBatches({ ...options, startIndex: index }));
      return;
    }
    index += 1;
  }

  const durationMs = now() - frameStart;
  if (durationMs > FRAME_BUDGET_MS) {
    recordRAFViolation(durationMs, processedThisFrame());
  }
  onProgress?.({ rendered: features.length, total: features.length });
  onComplete?.();
}
