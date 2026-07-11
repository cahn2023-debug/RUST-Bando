import { safeInvoke as invoke } from '../../implement/lib/tauri';
import { BincodeDecoder } from './bincodeDecoder';
import { MapState } from '@CONTRACT/types';
import { DesignBulkActionResponse } from '@CONTRACT/designTypes';

export const WINDOW_SYNC_SOURCE_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `window-${Math.random().toString(36).slice(2)}`;

let latestInitializeRequestId = 0;
export const getLatestInitializeRequestId = () => latestInitializeRequestId;
export const incrementInitializeRequestId = () => ++latestInitializeRequestId;

export const invokeBincode = async (
  cmd: string,
  args: any,
  timeoutMs = 30000,
  retryCount = 2
): Promise<MapState> => {
  const attempt = async (remaining: number): Promise<MapState> => {
    const tIPC = performance.now();
    let timeoutId: any;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`IPC Timeout (${cmd}) after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    try {
      const invokePromise = invoke<any>(cmd, args);
      const res = await Promise.race([invokePromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);

      const tData = performance.now();
      let uint8: Uint8Array;

      if (res instanceof Uint8Array) {
        uint8 = res;
      } else if (res instanceof ArrayBuffer) {
        uint8 = new Uint8Array(res);
      } else if (Array.isArray(res)) {
        uint8 = new Uint8Array(res);
      } else if (res && typeof res === 'object' && 'streaming_url' in res) {
        const fetchResp = await fetch((res as any).streaming_url);
        const buffer = await fetchResp.arrayBuffer();
        uint8 = new Uint8Array(buffer);
      } else {
        uint8 = new Uint8Array(res as any);
      }

      const tDecode = performance.now();
      const decoder = new BincodeDecoder(uint8);
      const result = await decoder.decodeMapStateAsync();
      const tDone = performance.now();

      console.log(
        `[Timeline] invokeBincode('${cmd}'): DataRecv=${(tData - tIPC).toFixed(1)}ms, Decode=${(tDone - tDecode).toFixed(1)}ms, Total=${(tDone - tIPC).toFixed(1)}ms`
      );
      return result;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      if (remaining > 0) {
        console.warn(`[Sync] invokeBincode('${cmd}') Retry (remaining: ${remaining})...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return attempt(remaining - 1);
      }
      throw err;
    }
  };

  return attempt(retryCount);
};

let designRequestId = 0;
const UUID_V4_LOOSE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuidLike = (value: unknown): value is string =>
  typeof value === 'string' && UUID_V4_LOOSE_RE.test(value.trim());

const hash32 = (input: string, seed: number): number => {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const stableUuidFromString = (raw: string): string => {
  const s = String(raw ?? '').trim() || 'empty';
  const p1 = hash32(s, 0x811c9dc5).toString(16).padStart(8, '0');
  const p2 = hash32(`b:${s}`, 0x9747b28c).toString(16).padStart(8, '0');
  const p3 = hash32(`c:${s}`, 0x85ebca6b).toString(16).padStart(8, '0');
  const p4 = hash32(`d:${s}`, 0xc2b2ae35).toString(16).padStart(8, '0');
  const hex = `${p1}${p2}${p3}${p4}`.slice(0, 32).split('');
  hex[12] = '5';
  const v = parseInt(hex[16], 16);
  hex[16] = ((v & 0x3) | 0x8).toString(16);
  const full = hex.join('');
  return `${full.slice(0, 8)}-${full.slice(8, 12)}-${full.slice(12, 16)}-${full.slice(16, 20)}-${full.slice(20, 32)}`;
};

const pickIdentifier = (obj: Record<string, any>, snakeKey: string, camelKey: string) =>
  obj[snakeKey] ?? obj[camelKey];

const withCompatArgs = <T extends Record<string, unknown>>(
  snake: T,
  camel: Record<string, unknown>
) => ({
  ...snake,
  ...camel,
});

export const invoke_design_event_batch = async (
  projectId: string | number,
  events: any[],
  retryCount = 2
): Promise<DesignBulkActionResponse> => {
  const projectIdStr = String(projectId);
  const effectiveProjectId = isUuidLike(projectIdStr)
    ? projectIdStr
    : stableUuidFromString(`project:${projectIdStr}`);
  const normalizedEvents = (events || []).map((ev: any, idx: number) => {
    if (!ev || typeof ev !== 'object') return ev;
    const obj: any = { ...ev };
    const projectIdValue = pickIdentifier(obj, 'project_id', 'projectId');
    if (!isUuidLike(projectIdValue)) {
      obj.project_id = effectiveProjectId;
      obj.projectId = effectiveProjectId;
    } else {
      obj.project_id = projectIdValue;
      obj.projectId = projectIdValue;
    }
    const entityIdValue = pickIdentifier(obj, 'entity_id', 'entityId');
    if (!isUuidLike(entityIdValue)) {
      const basis = String(
        entityIdValue ||
          obj?.payload?.id ||
          obj?.payload?.feature_id ||
          obj?.payload?.featureId ||
          `${obj.eventType || obj.type || 'event'}:${idx}`
      );
      const normalizedEntityId = stableUuidFromString(`entity:${basis}`);
      obj.entity_id = normalizedEntityId;
      obj.entityId = normalizedEntityId;
    } else {
      obj.entity_id = entityIdValue;
      obj.entityId = entityIdValue;
    }
    if (obj?.payload && typeof obj.payload === 'object') {
      const payloadFeatureId = pickIdentifier(obj.payload, 'feature_id', 'featureId');
      if (payloadFeatureId !== undefined) {
        obj.payload.feature_id = payloadFeatureId;
        obj.payload.featureId = payloadFeatureId;
      }
    }
    return obj;
  });

  const requestId = ++designRequestId;
  const timeoutMs = 60000;

  const attempt = async (remaining: number): Promise<DesignBulkActionResponse> => {
    let timeoutId: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`IPC Timeout (${requestId})`)), timeoutMs);
    });

    const invokePromise = invoke<DesignBulkActionResponse>(
      'invoke_design_event_batch',
      withCompatArgs(
        {
          project_id: effectiveProjectId,
          events: normalizedEvents,
          request_id: requestId,
        },
        {
          projectId: effectiveProjectId,
          events: normalizedEvents,
          requestId,
        }
      )
    ).then((response) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (!response) {
        return {
          success: false,
          last_event_id: '',
          applied_events: [],
          side_effects: [],
        } as DesignBulkActionResponse;
      }
      return response;
    });

    try {
      return await Promise.race([invokePromise, timeoutPromise]);
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      if (remaining > 0) {
        console.warn(`[Sync] IPC Retry ${requestId} (remaining: ${remaining})...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return attempt(remaining - 1);
      }
      throw err;
    }
  };

  return attempt(retryCount);
};

export const savePalettePersist = async (
  projectId: string | number,
  events: any[]
): Promise<DesignBulkActionResponse> => {
  return await invoke_design_event_batch(projectId, events);
};

export const loadDesignState = async (projectId: string): Promise<any | null> => {
  try {
    const result = await invoke<any>(
      'load_design_state_v2',
      withCompatArgs(
        {
          project_id: projectId,
        },
        {
          projectId,
        }
      )
    );
    return result ?? null;
  } catch (err) {
    console.warn('[V2] load_design_state failed:', err);
    return null;
  }
};

export const updateProjectStateV2 = async (
  projectId: string | number,
  state: any
): Promise<void> => {
  try {
    const project_id = String(projectId);
    await invoke(
      'update_project_state_v2',
      withCompatArgs(
        {
          project_id,
          project_state: state,
        },
        {
          projectId: project_id,
          projectState: state,
        }
      )
    );
  } catch (err) {
    console.warn('[V2] update_project_state_v2 failed:', err);
  }
};

export const queryProjection = async (table: string, projectId: string): Promise<any> => {
  try {
    return await invoke(
      'query_projection_v2',
      withCompatArgs(
        {
          table,
          project_id: projectId,
        },
        {
          table,
          projectId,
        }
      )
    );
  } catch (err) {
    console.warn(`[V2] query_projection_v2 failed for ${table}:`, err);
    return {};
  }
};

export const getTaskDependencies = async (): Promise<any[]> => {
  try {
    return await invoke('get_task_dependencies');
  } catch {
    return [];
  }
};

export const getContentTypes = async (): Promise<any[]> => {
  try {
    return await invoke('get_content_types');
  } catch {
    return [];
  }
};

export const getProjectBomTable = async (): Promise<any> => {
  try {
    return await invoke('get_project_bom_table');
  } catch {
    return { bom_table: [] };
  }
};

let metadataDebounceTimer: any = null;
let pendingMetadataPatch: Record<string, any> = {};

export const updateMetadataV2Debounced = (fileId: string, patch: any, delay = 300) => {
  pendingMetadataPatch[fileId] = { ...(pendingMetadataPatch[fileId] || {}), ...patch };

  if (metadataDebounceTimer) clearTimeout(metadataDebounceTimer);

  metadataDebounceTimer = setTimeout(async () => {
    const patches = { ...pendingMetadataPatch };
    pendingMetadataPatch = {};
    metadataDebounceTimer = null;

    for (const [id, p] of Object.entries(patches)) {
      try {
        await invoke(
          'update_metadata_v2',
          withCompatArgs(
            {
              file_id: id,
              patch: p,
            },
            {
              fileId: id,
              patch: p,
            }
          )
        );
      } catch (err) {
        console.error(`[V2] Debounced update failed for ${id}:`, err);
      }
    }
  }, delay);
};
