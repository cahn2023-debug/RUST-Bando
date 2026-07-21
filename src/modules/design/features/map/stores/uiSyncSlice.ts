import { StateCreator } from 'zustand';
import { UISyncSlice, DesignSyncStore } from './types';
import {
    DesignActionResponse,
    DesignBulkActionResponse,
    DesignEventType
} from '@CONTRACT/designTypes';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
    invoke_design_event_batch,
    isCollaborationCoordinatorEnabled,
    pull_collaboration_events
} from '@TOOL/utils/designIpc';

const DESIGN_PERSIST_BATCH_DELAY_MS = 150;
const IS_DEV = import.meta.env.DEV;

let eventBuffer: DesignEventType[] = [];
let flushTimeout: NodeJS.Timeout | null = null;
let bufferedProjectId: string | null = null;
let bufferedResolvers: Array<{
    resolve: (value: DesignBulkActionResponse | DesignActionResponse | undefined) => void;
    reject: (reason?: unknown) => void;
}> = [];
let lastUiRecoveryInitializeAt = 0;
const UI_RECOVERY_INITIALIZE_COOLDOWN_MS = 5000;
let consecutiveUiSyncFailures = 0;
let firstUiFailureAt = 0;
const UI_SYNC_FAILURE_WINDOW_MS = 30000;
const UI_MAX_SYNC_FAILURES_BEFORE_BREAKER = 3;
const COLLAB_PULL_INTERVAL_MS = 5000;
let collabPullInterval: ReturnType<typeof setInterval> | null = null;
let collabPullInFlight = false;

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

    setIsSaving: (isSaving: boolean) => set({ isSaving }),
    setPendingSync: (pending: boolean) => set({ pendingSync: pending }),
    setError: (error: string | null) => set({ error }),

    setupSyncListeners: async () => {
        const unlistenSync = await listen<number>('sync-status', (event) => {
            console.log(`[Sync] Status updated from backend: ${event.payload}`);
            set({ syncStatus: event.payload });
        });

        const unlistenBridge = await listen<unknown>('design-event-processed', (event) => {
            console.log(`[Bridge] Event processed by backend:`, event.payload);
            set({ lastSync: Date.now() });
        });

        const handleOnline = () => set({ isOnline: true });
        const handleOffline = () => set({ isOnline: false });
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        if (isCollaborationCoordinatorEnabled() && !collabPullInterval) {
            collabPullInterval = setInterval(async () => {
                const st = get();
                if (
                    collabPullInFlight ||
                    !st.projectId ||
                    !st.isOnline ||
                    st.isSaving ||
                    st.pendingSync ||
                    st.isHydrating
                ) {
                    return;
                }

                collabPullInFlight = true;
                try {
                    const response = await pull_collaboration_events(st.projectId);
                    if (response.applied_events?.length) {
                        get().applyPatchToState(response);
                        set({ lastSync: Date.now(), error: null });
                    }
                } catch (error: any) {
                    const message = typeof error === 'string' ? error : error?.message || String(error);
                    console.warn('[Sync] Collaboration pull failed:', message);
                    set({ error: `Collaboration pull failed: ${message}` });
                } finally {
                    collabPullInFlight = false;
                }
            }, COLLAB_PULL_INTERVAL_MS);
        }

        set({
            unsubscribeFirestore: () => {
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
                if (collabPullInterval) {
                    clearInterval(collabPullInterval);
                    collabPullInterval = null;
                }
                unlistenSync();
                unlistenBridge();
            }
        });
    },

    syncWithBackend: async (projectId: string, events: DesignEventType[]) => {
        if (!events || events.length === 0) return { success: true } as any;

        const batchId = crypto.randomUUID().substring(0, 8);
        if (IS_DEV) {
            console.group(`%c[PMP_FLOW] Batch Edit Start: ${batchId}`, 'color: #2196F3; font-weight: bold; font-size: 11px;');
            console.log(`[PMP_FLOW] Project ID: ${projectId} | Events: ${events.length}`);
        }

        try {
            set({ isSaving: true });

            const response = await invoke_design_event_batch(String(projectId), events as DesignEventType[]);

            if (IS_DEV) {
                console.log(`%c[PMP_SYNC] Success. .pmp updated. Last event: ${response.last_event_id}`, 'color: #4CAF50; font-weight: bold;');
            }
            onUiSyncSuccess();

            set({ lastSync: Date.now(), error: null, isSaving: false });
            if (IS_DEV) {
                console.groupEnd();
            }

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
            if (IS_DEV) {
                console.groupEnd();
            }
            throw error;
        }
    },

    _internalBufferedSyncEvent: async (event: DesignEventType) => {
        return get()._internalBufferedSyncEvents([event]);
    },

    _internalBufferedSyncEvents: async (events: DesignEventType[]) => {
        const { syncWithBackend, projectId } = get();
        if (!projectId || events.length === 0) return;

        const flushNow = async () => {
            if (!bufferedProjectId || eventBuffer.length === 0) return;

            const batch = eventBuffer;
            const resolvers = bufferedResolvers;
            const targetProjectId = bufferedProjectId;
            eventBuffer = [];
            bufferedResolvers = [];
            bufferedProjectId = null;
            if (flushTimeout) {
                clearTimeout(flushTimeout);
                flushTimeout = null;
            }

            try {
                const result = await syncWithBackend(targetProjectId, batch);
                set({ pendingSync: false });
                resolvers.forEach(({ resolve }) => resolve(result));
            } catch (err) {
                set({ pendingSync: false });
                resolvers.forEach(({ reject }) => reject(err));
            }
        };

        if (bufferedProjectId && bufferedProjectId !== projectId && eventBuffer.length > 0) {
            await flushNow();
        }

        bufferedProjectId = projectId;
        eventBuffer.push(...events);
        set({ pendingSync: true });

        if (flushTimeout) {
            clearTimeout(flushTimeout);
        }

        return new Promise((resolve, reject) => {
            bufferedResolvers.push({ resolve, reject });
            flushTimeout = setTimeout(() => {
                void flushNow();
            }, DESIGN_PERSIST_BATCH_DELAY_MS);
        });
    },

    flushPendingPersists: async () => {
        const { syncWithBackend, projectId } = get();
        const targetProjectId = bufferedProjectId ?? projectId;
        if (!targetProjectId || eventBuffer.length === 0) return;

        if (flushTimeout) {
            clearTimeout(flushTimeout);
            flushTimeout = null;
        }

        const batch = eventBuffer;
        const resolvers = bufferedResolvers;
        eventBuffer = [];
        bufferedResolvers = [];
        bufferedProjectId = null;

        try {
            const result = await syncWithBackend(targetProjectId, batch);
            set({ pendingSync: false });
            resolvers.forEach(({ resolve }) => resolve(result));
        } catch (err) {
            set({ pendingSync: false });
            resolvers.forEach(({ reject }) => reject(err));
            throw err;
        }
    },

    _undo: async (projectId: string) => {
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

    _redo: async (projectId: string) => {
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

    _deduplicate: async (projectId: string) => {
        await invoke('deduplicate_project_data', { projectId: String(projectId) });
        const now = Date.now();
        if (now - lastUiRecoveryInitializeAt > UI_RECOVERY_INITIALIZE_COOLDOWN_MS) {
            lastUiRecoveryInitializeAt = now;
            get().initialize(String(projectId), get().projectPath ?? undefined);
        }
    },

    syncWithFirestore: (projectId: string, data: unknown) => {
        console.warn('Firestore sync not yet implemented in V2 architecture.', { projectId, data });
        return Promise.resolve();
    }
});
