import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeMetadataObject } from '@TOOL/utils/metadataNormalization';

interface UseMetadataAutosaveOptions<T> {
  featureId: string | null | undefined;
  localMeta: T;
  persistedMeta: unknown;
  queueEvent: (event: any) => Promise<void>;
  setPreview?: (id: string | null, metadata: unknown | null) => void;
  debounceMs?: number;
  enabled?: boolean;
  suspend?: boolean;
  prepareMetadata?: (meta: T | unknown) => unknown;
  onPersisted?: () => void;
  onError?: (error: unknown) => void;
}

interface FlushOptions<T> {
  meta?: T;
  force?: boolean;
}

export function useMetadataAutosave<T>({
  featureId,
  localMeta,
  persistedMeta,
  queueEvent,
  setPreview,
  debounceMs = 300,
  enabled = true,
  suspend = false,
  prepareMetadata,
  onPersisted,
  onError,
}: UseMetadataAutosaveOptions<T>) {
  const [isSaving, setIsSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestMetaRef = useRef(localMeta);
  const lastSubmittedRef = useRef<string | null>(null);
  const wasDirtyRef = useRef(false);

  latestMetaRef.current = localMeta;

  const prepare = useCallback(
    (meta: T | unknown) =>
      prepareMetadata?.(meta) ?? normalizeMetadataObject((meta || {}) as Record<string, unknown>),
    [prepareMetadata]
  );

  const persistedJson = JSON.stringify(prepare(persistedMeta));
  const localJson = JSON.stringify(prepare(localMeta));

  const cancelPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flushNow = useCallback(
    async (options?: FlushOptions<T>) => {
      if (!featureId) return false;

      const nextMeta = options?.meta ?? latestMetaRef.current;
      const normalizedMeta = prepare(nextMeta);
      const nextJson = JSON.stringify(normalizedMeta);

      if (!options?.force) {
        if (nextJson === persistedJson || nextJson === lastSubmittedRef.current) {
          return false;
        }
      }

      cancelPending();
      lastSubmittedRef.current = nextJson;
      setIsSaving(true);

      try {
        await queueEvent({
          type: 'update_metadata',
          payload: {
            featureId,
            metadata: normalizedMeta,
          },
        });
        onPersisted?.();
        return true;
      } catch (error) {
        lastSubmittedRef.current = null;
        onError?.(error);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [cancelPending, featureId, onError, onPersisted, persistedJson, prepare, queueEvent, setPreview]
  );

  useEffect(() => {
    if (!enabled || suspend || !featureId) {
      cancelPending();
      wasDirtyRef.current = false;
      return;
    }

    if (localJson === persistedJson) {
      const shouldClearPreview = wasDirtyRef.current;
      lastSubmittedRef.current = null;
      cancelPending();
      wasDirtyRef.current = false;
      if (shouldClearPreview && setPreview) {
        setPreview(null, null);
      }
      return;
    }

    wasDirtyRef.current = true;
    timerRef.current = setTimeout(() => {
      void flushNow();
    }, debounceMs);

    return cancelPending;
  }, [cancelPending, debounceMs, enabled, featureId, flushNow, localJson, persistedJson, setPreview, suspend]);

  useEffect(() => cancelPending, [cancelPending]);

  return {
    isSaving,
    flushNow,
    cancelPending,
  };
}
