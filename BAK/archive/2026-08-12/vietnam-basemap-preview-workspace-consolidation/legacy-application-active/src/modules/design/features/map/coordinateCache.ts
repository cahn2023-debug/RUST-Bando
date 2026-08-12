import type { FeatureState } from '@CONTRACT/types';

/**
 * Parsed coordinate value — matches the structure returned by JSON.parse on raw coordinate strings.
 * null indicates missing or unparseable coordinates.
 */
export type ParsedCoordinates = number[] | number[][] | number[][][] | null;

/** Module-level cache — shared across all consumers, persists between renders. */
const cache = new Map<string, ParsedCoordinates>();

/**
 * Returns the cached coordinates for `featureId`, or parses `rawCoords` and stores
 * the result on first access.
 */
export function getCoordinates(
  featureId: string,
  rawCoords: unknown
): ParsedCoordinates {
  if (cache.has(featureId)) {
    return cache.get(featureId)!;
  }
  const parsed = parseRawCoordinates(rawCoords);
  cache.set(featureId, parsed);
  return parsed;
}

/**
 * Removes a single feature's entry from the cache.
 * Call this when a feature is updated or deleted.
 */
export function invalidate(featureId: string): void {
  cache.delete(featureId);
}

/**
 * Clears the entire cache.
 * Call this when switching projects to avoid stale coordinate data.
 */
export function invalidateAll(): void {
  cache.clear();
}

/**
 * Pre-parses coordinates for a list of features using a `queueMicrotask` chain
 * so the work is spread across microtask checkpoints and does not block the main thread.
 */
export function prePopulate(features: FeatureState[]): Promise<void> {
  return new Promise<void>((resolve) => {
    let index = 0;

    function processNext(): void {
      if (index >= features.length) {
        resolve();
        return;
      }
      const feature = features[index++];
      if (!cache.has(feature.id)) {
        cache.set(feature.id, parseRawCoordinates(feature.coordinates));
      }
      queueMicrotask(processNext);
    }

    queueMicrotask(processNext);
  });
}

/**
 * Parses a raw coordinate value.
 * - Strings are JSON-parsed (expected to be coordinate arrays).
 * - Arrays are returned as-is (cast to ParsedCoordinates).
 * - null / undefined / unparseable strings return null.
 */
function parseRawCoordinates(raw: unknown): ParsedCoordinates {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ParsedCoordinates;
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw) || typeof raw === 'object') {
    return raw as ParsedCoordinates;
  }
  return null;
}
