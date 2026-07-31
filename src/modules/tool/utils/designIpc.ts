import { safeInvoke as invoke } from '../../implement/lib/tauri';
import { BincodeDecoder } from './bincodeDecoder';
import { MapState } from '@CONTRACT/types';
import { DesignBulkActionResponse } from '@CONTRACT/designTypes';

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
export const isUuidLike = (value: unknown): boolean =>
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

const withCompatArgs = <T extends Record<string, unknown>>(
  snake: T,
  camel: Record<string, unknown>
) => ({
  ...snake,
  ...camel,
});

const COLLAB_COORDINATOR_URL = import.meta.env.VITE_COLLAB_COORDINATOR_URL?.trim() || '';
const COLLAB_SHARED_SECRET = import.meta.env.VITE_COLLAB_SHARED_SECRET?.trim() || '';

export const isCollaborationCoordinatorEnabled = () => COLLAB_COORDINATOR_URL.length > 0;

const syncCursorKey = (projectId: string) => `pmp.collaboration.cursor.${projectId}`;

const getStoredSyncCursor = (projectId: string): number => {
  if (typeof localStorage === 'undefined') return 0;
  const raw = localStorage.getItem(syncCursorKey(projectId));
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const setStoredSyncCursor = (projectId: string, seq: unknown) => {
  const parsed = Number(seq);
  if (typeof localStorage === 'undefined' || !Number.isFinite(parsed) || parsed <= 0) return;
  localStorage.setItem(syncCursorKey(projectId), String(parsed));
};

const postCoordinator = async <T>(action: string, request: Record<string, unknown>): Promise<T> => {
  const body = {
    action,
    secret: COLLAB_SHARED_SECRET || undefined,
    request,
  };

  const response = await invoke<T>('post_collaboration_json', {
    url: COLLAB_COORDINATOR_URL,
    body,
  });
  if (response) return response;

  const fetchResponse = await fetch(COLLAB_COORDINATOR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!fetchResponse.ok) {
    throw new Error(`Coordinator ${fetchResponse.status}: ${await fetchResponse.text()}`);
  }
  return (await fetchResponse.json()) as T;
};

const stableBatchId = (projectId: string, requestId: number, events: any[]) =>
  stableUuidFromString(
    `sync-batch:${projectId}:${requestId}:${events
      .map((event) => `${event?.id ?? ''}:${event?.entity_id ?? ''}:${event?.eventType ?? event?.type ?? ''}`)
      .join('|')}`
  );

const normalizeCollaborativeEvent = (
  projectId: string,
  event: any,
  requestId: number,
  index: number,
  batchId: string
) => {
  if (!event || typeof event !== 'object') return event;
  const obj: any = { ...event };
  const payload = obj.payload && typeof obj.payload === 'object' ? { ...obj.payload } : {};
  const payloadBasis =
    payload.id ||
    payload.feature_id ||
    payload.featureId ||
    payload.circuit_id ||
    payload.circuitId ||
    obj.entity_id ||
    obj.entityId ||
    `${obj.eventType || obj.type || 'event'}:${index}`;

  const stableEntityId = isUuidLike(payloadBasis)
    ? payloadBasis
    : isUuidLike(obj.entity_id ?? obj.entityId)
    ? (obj.entity_id ?? obj.entityId)
    : stableUuidFromString(`entity:${projectId}:${payloadBasis}`);
  const stableEventId = isUuidLike(obj.id)
    ? obj.id
    : stableUuidFromString(`event:${batchId}:${index}:${payloadBasis}`);

  obj.id = stableEventId;
  obj.entity_id = stableEntityId;
  obj.entityId = stableEntityId;
  obj.project_id = projectId;
  obj.projectId = projectId;
  obj.request_id = requestId;
  obj.requestId = requestId;
  obj.batch_id = batchId;
  obj.batchId = batchId;
  obj.base_entity_version = Number(obj.base_entity_version ?? obj.baseEntityVersion ?? 1);
  obj.baseEntityVersion = obj.base_entity_version;
  obj.entity_version = Number(obj.entity_version ?? obj.entityVersion ?? 1);
  obj.entityVersion = obj.entity_version;
  obj.payload = payload;
  return obj;
};

export const invoke_design_event_batch = async (
  projectId: string | number,
  events: any[],
  retryCount = 2
): Promise<DesignBulkActionResponse> => {
  const projectIdStr = String(projectId);
  const effectiveProjectId = isUuidLike(projectIdStr)
    ? projectIdStr
    : stableUuidFromString(`project:${projectIdStr}`);
  const requestId = ++designRequestId;
  const batchId = stableBatchId(effectiveProjectId, requestId, events || []);
  const normalizedEvents = (events || []).map((ev: any, idx: number) =>
    normalizeCollaborativeEvent(effectiveProjectId, ev, requestId, idx, batchId)
  );
  const timeoutMs = 60000;

  const attempt = async (remaining: number): Promise<DesignBulkActionResponse> => {
    let timeoutId: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`IPC Timeout (${requestId})`)), timeoutMs);
    });

    const payload = withCompatArgs(
      {
        project_id: effectiveProjectId,
        events: normalizedEvents,
        request_id: requestId,
        batch_id: batchId,
      },
      {
        projectId: effectiveProjectId,
        events: normalizedEvents,
        requestId,
        batchId,
      }
    );

    const invokePromise = (isCollaborationCoordinatorEnabled()
      ? postCoordinator<DesignBulkActionResponse>('commitBatch', payload)
      : invoke<DesignBulkActionResponse>('invoke_design_event_batch', payload)
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
      setStoredSyncCursor(effectiveProjectId, (response as any).seqEnd ?? (response as any).serverSeqEnd);
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

export const pull_collaboration_events = async (
  projectId: string | number,
  limit = 100
): Promise<DesignBulkActionResponse & { seqEnd?: number; hasMore?: boolean }> => {
  if (!isCollaborationCoordinatorEnabled()) {
    return {
      success: true,
      last_event_id: '',
      applied_events: [],
      side_effects: [],
    };
  }

  const projectIdStr = String(projectId);
  const effectiveProjectId = isUuidLike(projectIdStr)
    ? projectIdStr
    : stableUuidFromString(`project:${projectIdStr}`);
  const afterSeq = getStoredSyncCursor(effectiveProjectId);
  const response = await postCoordinator<DesignBulkActionResponse & { seqEnd?: number; hasMore?: boolean }>(
    'pullEvents',
    {
      project_id: effectiveProjectId,
      projectId: effectiveProjectId,
      after_seq: afterSeq,
      afterSeq,
      limit,
    }
  );
  setStoredSyncCursor(effectiveProjectId, (response as any).seqEnd ?? afterSeq);
  return response;
};

export const loadDesignState = async (
  projectId: string,
  options: { includeFeatures?: boolean } = {}
): Promise<any | null> => {
  try {
    const result = await invoke<any>(
      'load_design_state_v2',
      withCompatArgs(
        {
          project_id: projectId,
          include_features: options.includeFeatures,
        },
        {
          projectId,
          includeFeatures: options.includeFeatures,
        }
      )
    );
    return result ?? null;
  } catch (err) {
    console.warn('[V2] load_design_state failed:', err);
    return null;
  }
};

export interface ProjectBootstrap {
  project: any;
  featureCount: number;
  mapRevision: number;
  initialBounds?: {
    south?: number | null;
    north?: number | null;
    west?: number | null;
    east?: number | null;
  } | null;
  settings: Record<string, unknown>;
  regions: Record<string, unknown>;
  layers: Record<string, unknown>;
  featureGroups: Record<string, unknown>;
  streamingMode: boolean;
  viewportFirst?: boolean;
  cacheStatus: {
    cachedTiles: number;
    state: 'ready' | 'missing' | 'building' | string;
    lastViewportReady?: boolean;
  };
  openPerformanceHint?: Record<string, number>;
  openRequestId?: number | null;
}

export const openProjectBootstrap = async (
  path: string,
  openRequestId: number
): Promise<ProjectBootstrap> => {
  return await invoke<ProjectBootstrap>(
    'open_project_bootstrap',
    withCompatArgs(
      {
        path,
        open_request_id: openRequestId,
      },
      {
        path,
        openRequestId,
      }
    )
  );
};

export const getProjectBootstrapV2 = async (projectId: string): Promise<ProjectBootstrap> => {
  return await invoke<ProjectBootstrap>(
    'get_project_bootstrap_v2',
    withCompatArgs(
      {
        project_id: projectId,
      },
      {
        projectId,
      }
    )
  );
};

export const getMapTileV2 = async (
  projectId: string,
  revision: number,
  z: number,
  x: number,
  y: number
): Promise<Uint8Array> => {
  const result = await invoke<number[] | Uint8Array>('get_map_tile_v2', {
    project_id: projectId,
    projectId,
    revision,
    z,
    x,
    y,
  });
  return result instanceof Uint8Array ? result : new Uint8Array(result || []);
};

export const buildMapTilesV2 = async (
  projectId: string,
  revision: number,
  options: {
    minZoom?: number;
    maxZoom?: number;
    bounds?: [number, number, number, number];
    tileLimit?: number;
  } = {}
): Promise<any> => {
  return await invoke('build_map_tiles_v2', {
    project_id: projectId,
    projectId,
    revision,
    min_zoom: options.minZoom,
    minZoom: options.minZoom,
    max_zoom: options.maxZoom,
    maxZoom: options.maxZoom,
    bounds: options.bounds,
    tile_limit: options.tileLimit,
    tileLimit: options.tileLimit,
  });
};

export const invalidateMapTilesV2 = async (
  projectId: string,
  options: { revision?: number; bbox?: [number, number, number, number] } = {}
): Promise<any> => {
  return await invoke('invalidate_map_tiles_v2', {
    project_id: projectId,
    projectId,
    revision: options.revision,
    bbox: options.bbox,
  });
};

export interface VisibleFeatureBounds {
  s: number;
  n: number;
  w: number;
  e: number;
}

export interface VisibleFeaturesResponse {
  features: MapState['features'][string][];
  total: number;
  returned: number;
  truncated: boolean;
  limit: number;
  revision?: number;
  requestId?: number | null;
}

export const queryVisibleFeaturesV2 = async (
  projectId: string,
  bounds: VisibleFeatureBounds,
  zoom: number,
  hiddenIds: string[] = [],
  limit = 10000,
  fastPayload = false,
  revision?: number,
  requestId?: number
): Promise<VisibleFeaturesResponse> => {
  const result = await invoke<VisibleFeaturesResponse>(
    'query_visible_features_v2',
    withCompatArgs(
      {
        project_id: projectId,
        bounds,
        zoom,
        hidden_ids: hiddenIds,
        limit,
        fast_payload: fastPayload,
        revision,
        request_id: requestId,
      },
      {
        projectId,
        bounds,
        zoom,
        hiddenIds,
        limit,
        fastPayload,
        revision,
        requestId,
      }
    )
  );
  return result ?? { features: [], total: 0, returned: 0, truncated: false, limit };
};

export const getFeatureDetailV2 = async (
  projectId: string,
  featureId: string
): Promise<MapState['features'][string]> => {
  return await invoke<MapState['features'][string]>(
    'get_feature_detail_v2',
    withCompatArgs(
      {
        project_id: projectId,
        feature_id: featureId,
      },
      {
        projectId,
        featureId,
      }
    )
  );
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
