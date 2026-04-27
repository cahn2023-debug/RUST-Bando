import { safeInvoke as invoke } from '../../implement/lib/tauri';
import { BincodeDecoder } from './bincodeDecoder';
import { MapState } from '@CONTRACT/types';
import { DesignBulkActionResponse } from '@CONTRACT/designTypes';

export const WINDOW_SYNC_SOURCE_ID =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `window-${Math.random().toString(36).slice(2)}`;

// --- Initialization Tracking ---
let latestInitializeRequestId = 0;
export const getLatestInitializeRequestId = () => latestInitializeRequestId;
export const incrementInitializeRequestId = () => ++latestInitializeRequestId;

export const invokeBincode = async (cmd: string, args: any, timeoutMs?: number): Promise<MapState> => {
    const tIPC = performance.now();

    let timeoutId: any;
    const timeoutPromise = timeoutMs ? new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`IPC Timeout after ${timeoutMs}ms`)), timeoutMs);
    }) : null;

    try {
        const invokePromise = invoke<any>(cmd, args);
        const res = timeoutPromise ? await Promise.race([invokePromise, timeoutPromise]) : await invokePromise;
        if (timeoutId) clearTimeout(timeoutId);

        const tData = performance.now();
        let uint8: Uint8Array;

        // Tauri 2 Binary IPC handling
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

        console.log(`[Timeline] invokeBincode('${cmd}'): DataRecv=${(tData - tIPC).toFixed(1)}ms, Decode=${(tDone - tDecode).toFixed(1)}ms, Total=${(tDone - tIPC).toFixed(1)}ms`);
        return result;
    } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        throw err;
    }
};

export const invoke_design_event_batch = async (
    projectId: string | number,
    events: any[]
): Promise<DesignBulkActionResponse> => {
    const TIMEOUT_MS = 120000; // 120 seconds timeout for heavy background synchronization

    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Đồng bộ hóa dữ liệu quá lâu (>${TIMEOUT_MS / 1000}s). Hệ thống vẫn đang xử lý ngầm, vui lòng không tắt ứng dụng.`)), TIMEOUT_MS);
    });

    const invokePromise = invoke<DesignBulkActionResponse>('invoke_design_event_batch', { projectId: String(projectId), events })
        .then(response => {
            if (!response) {
                return {
                    success: false,
                    last_event_id: "",
                    applied_events: [],
                    side_effects: []
                } as DesignBulkActionResponse;
            }
            if (!(response as any).success && Array.isArray(response)) {
                // If it returns Vec<String> instead of DesignBulkActionResponse
                return {
                    success: true,
                    last_event_id: response[response.length - 1] || "",
                    applied_events: response,
                    side_effects: []
                } as DesignBulkActionResponse;
            }
            return response;
        });

    return Promise.race([invokePromise, timeoutPromise]);
};

// --- Palette Persist ---
export const savePalettePersist = async (
    projectId: string | number,
    events: any[]
): Promise<DesignBulkActionResponse> => {
    return await invoke_design_event_batch(projectId, events);
};
