import { StateCreator } from 'zustand';
import { InitializationSlice, DesignSyncStore } from './types';
import { safeInvoke as invoke } from '../../../../implement/lib/tauri';
import { listen } from '@tauri-apps/api/event';
import { logger } from '../../../../tool/utils/logger';
import {
    incrementInitializeRequestId,
    getLatestInitializeRequestId,
    loadDesignState
} from '../../../../tool/utils/designIpc';
import { normalizeMapStateForDisplay } from '../../../../tool/utils/normalizeDisplay';


let initWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
let loadingSinceTs: number | null = null;
let lastInitializedKey: string | null = null;
let lastInitializedAt = 0;
let initBurstWindowStart = 0;
let initBurstCount = 0;
let initBurstKey: string | null = null;
const INIT_BURST_WINDOW_MS = 30000;
const INIT_BURST_MAX_COUNT = 6;

export const createInitializationSlice: StateCreator<DesignSyncStore, [], [], InitializationSlice> = (set, get) => ({
    unsubscribeFirestore: null,
    pegmanState: {
        active: false,
        location: null,
        heading: 0,
        fov: 90,
        windowOpen: false,
        source: 'map',
        lastSyncAt: 0,
        featureId: null
    },

    setPegmanState: (updates) => set((s) => ({
        pegmanState: { ...s.pegmanState, ...updates }
    })),

    initialize: async (projectId: string, projectPath?: string) => {
        const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
            return await Promise.race([
                promise,
                new Promise<T>((_, reject) =>
                    setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
                )
            ]);
        };
        const normalizedProjectKey = projectPath ?? `id:${projectId}`;
        const currentInitKey = `${projectId}@${normalizedProjectKey}`;
        const {
            projectId: currentProjectId,
            state: currentState,
            isLoading: currentlyLoading
        } = get();

        // Prevent rapid re-initialize storms for the same project.
        const now = Date.now();
        if (
            initBurstKey !== currentInitKey ||
            !initBurstWindowStart ||
            now - initBurstWindowStart > INIT_BURST_WINDOW_MS
        ) {
            initBurstKey = currentInitKey;
            initBurstWindowStart = now;
            initBurstCount = 1;
        } else {
            initBurstCount += 1;
        }
        if (initBurstCount > INIT_BURST_MAX_COUNT) {
            logger.error(
                `[Sync] Initialization burst detected for ${currentInitKey} (${initBurstCount}/${INIT_BURST_WINDOW_MS}ms). Blocking to prevent loop.`
            );
            set({
                isLoading: false,
                isHydrating: false,
                error: 'Đã phát hiện vòng lặp đồng bộ. Vui lòng đóng/mở lại dự án để tiếp tục.'
            });
            return;
        }

        if (
            lastInitializedKey === currentInitKey &&
            now - lastInitializedAt < 3000 &&
            currentState &&
            !currentlyLoading
        ) {
            return;
        }

        // 1. Nếu đang nạp chính project này, bỏ qua để tránh loop
        if (currentlyLoading && currentProjectId === projectId) {
            const now = Date.now();
            const isStaleLoading = !!loadingSinceTs && now - loadingSinceTs > 20000;
            if (!isStaleLoading) {
                logger.sync(`[Sync] Already initializing project ${projectId}. Ignoring duplicate call.`);
                return;
            }
            logger.warn(`[Sync] Detected stale loading state for project ${projectId}. Recovering...`);
            set({ isLoading: false, isHydrating: false });
        }

        // 2. Nếu đã nạp xong và không có lỗi, không cần nạp lại
        if (
            currentProjectId === projectId &&
            currentState &&
            !get().error &&
            !currentlyLoading
        ) {
            return;
        }

        const initializeRequestId = incrementInitializeRequestId();
        loadingSinceTs = Date.now();
        if (initWatchdogTimer) {
            clearTimeout(initWatchdogTimer);
            initWatchdogTimer = null;
        }
        initWatchdogTimer = setTimeout(() => {
            if (initializeRequestId === getLatestInitializeRequestId()) {
                set({
                    isLoading: false,
                    isHydrating: false,
                    error: 'Hydration timeout: vui lòng thử mở lại dự án.'
                });
                loadingSinceTs = null;
            }
        }, 20000);

        const currentUnsubscribe = get().unsubscribeFirestore;
        if (currentUnsubscribe) currentUnsubscribe();

        set({
            isLoading: true,
            isHydrating: true,
            error: null,
            state: (currentProjectId === projectId || get().isSaving) ? currentState : null,
            projectId,
            projectPath,
            projectKey: normalizedProjectKey,
            unsubscribeFirestore: null,
            pendingSync: false,
            previewMetadata: null,
            boxSelection: null,
            printArea: null,
            currentDrawingPoints: [],
            currentDrawingSnapIds: [],
            snappedPoint: null,
            editingFeatureId: null,
            hoverId: null,
            groupThemePreview: null,
            selectedFeatureId: null,
            selectedGroupId: null,
            activeParentFeatureId: null,
            selectionSet: new Set(),
            mapHiddenIds: new Set(),
            searchResultMarker: null,
            zoomToTrigger: null
        });

        try {
            let activeProject = await invoke<any>('get_active_project').catch(() => null);
            const activeProjectId = activeProject?.id ? String(activeProject.id) : null;
            const needsLoad = !activeProject || activeProjectId !== projectId;

            if (needsLoad) {
                if (projectPath) {
                    logger.sync(`[Sync] Loading project from: ${projectPath}`);
                    await withTimeout(invoke('load_pmp_file', { path: projectPath }), 15000, 'load_pmp_file');
                } else if (activeProject) {
                    throw new Error(`Phiên làm việc cho dự án ${projectId} đã kết thúc. Vui lòng mở lại tệp.`);
                }
            }

            if (initializeRequestId !== getLatestInitializeRequestId()) return;

            console.log(`[useDesignSync] Initializing project: ${projectId} (Task: ${initializeRequestId})`);

            const tStart = performance.now();
            let state;
            try {
                // ✅ Sử dụng utility loadDesignState (V2 Bridge) thay vì invokeBincode
                state = await withTimeout(loadDesignState(projectId), 15000, 'loadDesignState');

                if (initializeRequestId !== getLatestInitializeRequestId()) {
                    logger.sync(`[Sync] Request ${initializeRequestId} stale after hydration. Abandoning state update.`);
                    return;
                }
            } catch (e: any) {
                if (e?.toString().includes("CANCELLED")) {
                    logger.sync(`[Sync] Backend cancelled hydration for req ${initializeRequestId}.`);
                    return;
                }

                if (e?.toString().includes("Timeout")) {
                    throw new Error(`Không thể nạp dữ liệu: Phản hồi từ Backend quá chậm hoặc Database bị khóa (Locked). Vui lòng thử lại.`);
                }

                if (e?.toString().includes("Database Lock")) {
                    console.warn("[useDesignSync] Retrying hydration after lock discovery...");
                    await new Promise(r => setTimeout(r, 2000));
                    state = await withTimeout(loadDesignState(projectId), 15000, 'loadDesignState');
                } else {
                    throw e;
                }
            }

            if (initializeRequestId !== getLatestInitializeRequestId()) return;

            if (!state) {
                throw new Error("Không thể nạp dữ liệu bản vẽ từ backend.");
            }

            const tDone = performance.now();
            logger.info(`[Store] ✅ Hydration completed in ${(tDone - tStart).toFixed(1)}ms for project ${projectId}`);

            // Standardize state using the canonical helper
            const normalizedState = normalizeMapStateForDisplay(state);

            set({
                state: normalizedState,
                projectId,
                projectKey: normalizedProjectKey,
                projectPath,
                lastSync: Date.now()
            });
            lastInitializedKey = currentInitKey;
            lastInitializedAt = Date.now();

            // V2 Fix: DO NOT hide any data from database
            // All data is visible by default. Only hide when user clicks the eye icon.
            // mapHiddenIds starts empty - only populated by user actions

            console.log(`[Store] Hydration complete for project: ${projectId}`);

            const handleOnline = () => set({ isOnline: true });
            const handleOffline = () => set({ isOnline: false });
            window.addEventListener('online', handleOnline);
            window.addEventListener('offline', handleOffline);

            const unlistenSync = await listen<number>('sync-status', (event) => {
                console.log(`[Sync] Status updated from backend: ${event.payload}`);
                set({ syncStatus: event.payload });
            });

            set({
                unsubscribeFirestore: () => {
                    window.removeEventListener('online', handleOnline);
                    window.removeEventListener('offline', handleOffline);
                    unlistenSync();
                }
            });

        } catch (err: any) {
            if (initializeRequestId !== getLatestInitializeRequestId()) {
                logger.warn(
                    `[Store] Ignoring stale hydration failure for project ${projectId} (${normalizedProjectKey})`
                );
                return;
            }

            logger.error(`[Store] Hydration error for project ${projectId} (${normalizedProjectKey}): ${err}`);
            localStorage.removeItem('lastProjectId');
            localStorage.removeItem('bando:v2_state'); // Clear stale layout/state cache
            set({ error: String(err) });
        } finally {
            if (initWatchdogTimer) {
                clearTimeout(initWatchdogTimer);
                initWatchdogTimer = null;
            }
            loadingSinceTs = null;
            if (initializeRequestId === getLatestInitializeRequestId()) {
                set({ isLoading: false, isHydrating: false });
            }
        }
    },

    reset: () => set({
        state: null,
        projectId: null,
        projectPath: null,
        projectKey: null,
        error: null,
        isLoading: false,
        isHydrating: false,
        pendingSync: false,
        selectedFeatureId: null,
        editingFeatureId: null,
        selectionSet: new Set(),
        currentDrawingPoints: [],
        currentDrawingSnapIds: [],
        snappedPoint: null,
        hoverId: null
    }),

    setMockState: (state, projectId, projectKey) => set({
        state,
        projectId,
        projectKey: projectKey ?? `id:${projectId}`,
        lastSync: Date.now()
    })
});


