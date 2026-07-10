import { StateCreator } from 'zustand';
import { UISyncSlice, DesignSyncStore } from './types';
import { DesignEventType } from '@CONTRACT/designTypes';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { invoke_design_event_batch } from '@TOOL/utils/designIpc';

let eventBuffer: any[] = [];
let flushTimeout: NodeJS.Timeout | null = null;
let lastUiRecoveryInitializeAt = 0;
const UI_RECOVERY_INITIALIZE_COOLDOWN_MS = 5000;
let consecutiveUiSyncFailures = 0;
let firstUiFailureAt = 0;
const UI_SYNC_FAILURE_WINDOW_MS = 30000;
const UI_MAX_SYNC_FAILURES_BEFORE_BREAKER = 3;

const onUiSyncSuccess = () => {
    consecutiveUiSyncFailures = 0;
    firstUiFailureAt = 0;
};

const onUiSyncFailure = (): boolean => {
    const now = Date.now();
    if (!firstUiFailureAt || now - firstUiFailureAt > UI_SYNC_FAILURE_WINDOW_MS) {
        firstUiFailureAt = now;
        consecutiveUiSyncFailures = 1;
    } else {
        consecutiveUiSyncFailures += 1;
    }
    return consecutiveUiSyncFailures < UI_MAX_SYNC_FAILURES_BEFORE_BREAKER;
};

export const createUISyncSlice: StateCreator<DesignSyncStore, [], [], UISyncSlice> = (set, get) => ({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    pendingSync: false,
    isMigrating: false,
    isSaving: false,
    lastSync: null,
    syncStatus: 0,
    error: null,
    unsubscribeFirestore: null,

    setIsSaving: (isSaving) => set({ isSaving }),
    setPendingSync: (pending) => set({ pendingSync: pending }),
    setError: (error) => set({ error }),

    setupSyncListeners: async () => {
        const unlistenSync = await listen<number>('sync-status', (event) => {
            console.log(`[Sync] Status updated from backend: ${event.payload}`);
            set({ syncStatus: event.payload });
        });

        const unlistenBridge = await listen<any>('design-event-processed', (event) => {
            console.log(`[Bridge] Event processed by backend:`, event.payload);
            set({ lastSync: Date.now() });
        });

        const handleOnline = () => set({ isOnline: true });
        const handleOffline = () => set({ isOnline: false });
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        set({
            unsubscribeFirestore: () => {
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
                unlistenSync();
                unlistenBridge();
            }
        });
    },

    syncWithBackend: async (projectId, events) => {
        if (!events || events.length === 0) return { success: true } as any;

        const batchId = crypto.randomUUID().substring(0, 8);
        console.group(`%c[PMP_FLOW] Batch Edit Start: ${batchId}`, 'color: #2196F3; font-weight: bold; font-size: 11px;');
        console.log(`[PMP_FLOW] Project ID: ${projectId} | Events: ${events.length}`);

        try {
            set({ isSaving: true });

            const response = await invoke_design_event_batch(String(projectId), events as any[]);

            console.log(`%c[PMP_SYNC] Success. .pmp updated. Last event: ${response.last_event_id}`, 'color: #4CAF50; font-weight: bold;');
            onUiSyncSuccess();

            set({ lastSync: Date.now(), error: null, isSaving: false });
            console.groupEnd();

            return response as any;
        } catch (error: any) {
            console.error(`%c[PMP_SYNC] Critical Sync Failure:`, 'color: #F44336; font-weight: bold;', error);

            const errorMsg = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
            console.error('[PMP_SYNC] Error details:', errorMsg);
            const shouldRetryRecover = onUiSyncFailure();
            set({
                error: shouldRetryRecover
                    ? `Backend Sync Error: ${errorMsg}`
                    : 'Sync đang lỗi liên tục. Đã tạm ngắt tự đồng bộ để tránh lặp. Vui lòng mở lại dự án.',
                isSaving: false
            });
            console.groupEnd();
            throw error;
        }
    },

    _internalBufferedSyncEvent: async (event: DesignEventType) => {
        return get()._internalBufferedSyncEvents([event]);
    },

    _internalBufferedSyncEvents: async (events: DesignEventType[]) => {
        const { syncWithBackend, projectId } = get();
        if (!projectId) return;

        eventBuffer.push(...events);

        if (flushTimeout) {
            clearTimeout(flushTimeout);
        }

        set({ pendingSync: true });

        return new Promise((resolve, reject) => {
            flushTimeout = setTimeout(async () => {
                const batch = [...eventBuffer];
                eventBuffer = [];
                flushTimeout = null;

                try {
                    const result = await syncWithBackend(projectId, batch);
                    set({ pendingSync: false });
                    resolve(result as any);
                } catch (err) {
                    set({ pendingSync: false });
                    reject(err);
                }
            }, 200);
        });
    },

    flushPendingPersists: async () => {
        const { syncWithBackend, projectId } = get();
        if (!projectId || eventBuffer.length === 0) return;

        if (flushTimeout) {
            clearTimeout(flushTimeout);
            flushTimeout = null;
        }

        const batch = [...eventBuffer];
        eventBuffer = [];

        try {
            await syncWithBackend(projectId, batch);
            set({ pendingSync: false });
        } catch (err) {
            set({ pendingSync: false });
            throw err;
        }
    },

    _undo: async (projectId) => {
        const responseStr = await invoke<string>('undo_design_event', { projectId: String(projectId) });
        const response = JSON.parse(responseStr);
        if (response.success) {
            const now = Date.now();
            if (now - lastUiRecoveryInitializeAt > UI_RECOVERY_INITIALIZE_COOLDOWN_MS) {
                lastUiRecoveryInitializeAt = now;
                get().initialize(String(projectId), get().projectPath ?? undefined);
            }
        }
    },

    _redo: async (projectId) => {
        const responseStr = await invoke<string>('redo_design_event', { projectId: String(projectId) });
        const response = JSON.parse(responseStr);
        if (response.success) {
            const now = Date.now();
            if (now - lastUiRecoveryInitializeAt > UI_RECOVERY_INITIALIZE_COOLDOWN_MS) {
                lastUiRecoveryInitializeAt = now;
                get().initialize(String(projectId), get().projectPath ?? undefined);
            }
        }
    },

    _deduplicate: async (projectId) => {
        await invoke('deduplicate_project_data', { projectId: String(projectId) });
        const now = Date.now();
        if (now - lastUiRecoveryInitializeAt > UI_RECOVERY_INITIALIZE_COOLDOWN_MS) {
            lastUiRecoveryInitializeAt = now;
            get().initialize(String(projectId), get().projectPath ?? undefined);
        }
    },

    syncWithFirestore: async (projectId, data) => {
        console.warn('Firestore sync not yet implemented in V2 architecture.', { projectId, data });
    }
});
