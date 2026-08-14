import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCoordinates, invalidate, invalidateAll, prePopulate } from '../coordinateCache';
import type { FeatureState } from '@CONTRACT/types';

describe('coordinateCache', () => {
  beforeEach(() => {
    invalidateAll();
    vi.restoreAllMocks();
  });

  // 1. Round-trip: 1D array
  it('parses a 1D string coordinate and returns the correct array', () => {
    expect(getCoordinates('id1', '[1,2]')).toEqual([1, 2]);
  });

  // 2. Round-trip: 2D array
  it('parses a 2D string coordinate and returns the correct nested array', () => {
    expect(getCoordinates('id2', '[[1,2],[3,4]]')).toEqual([[1, 2], [3, 4]]);
  });

  // 3. Cache hit — JSON.parse should only be invoked once per unique ID
  it('does not re-parse on cache hit — JSON.parse is called only once', () => {
    const parseSpy = vi.spyOn(JSON, 'parse');

    getCoordinates('id3', '[10,20]');
    getCoordinates('id3', '[10,20]');

    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  // 4. invalidate — subsequent call for same ID re-parses
  it('re-parses after invalidate(id)', () => {
    const parseSpy = vi.spyOn(JSON, 'parse');

    getCoordinates('id1', '[1,2]');
    invalidate('id1');
    getCoordinates('id1', '[1,2]');

    expect(parseSpy).toHaveBeenCalledTimes(2);
  });

  // 5. invalidateAll — all three entries re-parse after clearing cache
  it('re-parses all entries after invalidateAll', () => {
    getCoordinates('a', '[1,2]');
    getCoordinates('b', '[3,4]');
    getCoordinates('c', '[5,6]');

    invalidateAll();

    const parseSpy = vi.spyOn(JSON, 'parse');
    getCoordinates('a', '[1,2]');
    getCoordinates('b', '[3,4]');
    getCoordinates('c', '[5,6]');

    expect(parseSpy).toHaveBeenCalledTimes(3);
  });

  // 6. Null input returns null
  it('returns null when rawCoords is null', () => {
    expect(getCoordinates('id', null)).toBeNull();
  });

  // 7. Undefined input returns null
  it('returns null when rawCoords is undefined', () => {
    expect(getCoordinates('id', undefined)).toBeNull();
  });

  // 8. Invalid JSON string returns null
  it('returns null for an unparseable JSON string', () => {
    expect(getCoordinates('id', 'not valid json')).toBeNull();
  });

  // 9. Already-array input is returned as-is without JSON.parse
  it('returns an array payload as-is without calling JSON.parse', () => {
    const parseSpy = vi.spyOn(JSON, 'parse');
    const coords = [1, 2];

    const result = getCoordinates('id', coords);

    expect(result).toBe(coords);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  // 10. prePopulate — subsequent getCoordinates calls should NOT call JSON.parse
  it('prePopulate fills cache so subsequent getCoordinates calls skip JSON.parse', async () => {
    const features = [
      { id: 'f1', coordinates: '[1,1]' },
      { id: 'f2', coordinates: '[2,2]' },
      { id: 'f3', coordinates: '[3,3]' },
    ] as unknown as FeatureState[];

    await prePopulate(features);

    const parseSpy = vi.spyOn(JSON, 'parse');
    expect(getCoordinates('f1', '[1,1]')).toEqual([1, 1]);
    expect(getCoordinates('f2', '[2,2]')).toEqual([2, 2]);
    expect(getCoordinates('f3', '[3,3]')).toEqual([3, 3]);
    expect(parseSpy).not.toHaveBeenCalled();
  });
});
