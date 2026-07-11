import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataAutosave } from './useMetadataAutosave';

describe('useMetadataAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces metadata persistence for normal field changes', async () => {
    const queueEvent = vi.fn().mockResolvedValue(undefined);
    const setPreview = vi.fn();

    const { rerender } = renderHook((props: any) => useMetadataAutosave(props), {
      initialProps: {
        featureId: 'feature-1',
        localMeta: { infrastructure: { type: 'PowerLine' } },
        persistedMeta: {},
        queueEvent,
        setPreview,
        debounceMs: 300,
      },
    });

    await act(async () => {
      vi.advanceTimersByTime(299);
      await Promise.resolve();
    });
    expect(queueEvent).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(queueEvent).toHaveBeenCalledTimes(1);
    expect(queueEvent).toHaveBeenCalledWith({
      type: 'update_metadata',
      payload: {
        featureId: 'feature-1',
        metadata: expect.objectContaining({
          infrastructure: expect.objectContaining({ type: 'PowerLine' }),
        }),
      },
    });
    expect(setPreview).not.toHaveBeenCalled();

    rerender({
      featureId: 'feature-1',
      localMeta: { infrastructure: { type: 'PowerLine' } },
      persistedMeta: { infrastructure: { type: 'PowerLine' } },
      queueEvent,
      setPreview,
      debounceMs: 300,
    });

    expect(setPreview).toHaveBeenCalledWith(null, null);
  });

  it('waits during suspended drag and persists on explicit flush', async () => {
    const queueEvent = vi.fn().mockResolvedValue(undefined);
    const setPreview = vi.fn();

    const { result } = renderHook((props: any) => useMetadataAutosave(props), {
      initialProps: {
        featureId: 'feature-2',
        localMeta: { gis: { rotation: 120 } },
        persistedMeta: {},
        queueEvent,
        setPreview,
        debounceMs: 300,
        suspend: true,
      },
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(queueEvent).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.flushNow();
    });

    expect(queueEvent).toHaveBeenCalledTimes(1);
    expect(queueEvent).toHaveBeenCalledWith({
      type: 'update_metadata',
      payload: {
        featureId: 'feature-2',
        metadata: expect.objectContaining({
          gis: expect.objectContaining({ rotation: 120 }),
        }),
      },
    });
  });
});
