import { StateCreator } from 'zustand';
import { InitializationSlice, DesignSyncStore } from './types';
import { safeInvoke as invoke } from '../../../../implement/lib/tauri';
import { emit, listen } from '@tauri-apps/api/event';
import { logger } from '../../../../tool/utils/logger';
import {
    incrementInitializeRequestId,
    getLatestInitializeRequestId,
    invokeBincode
} from '../../../../tool/utils/designIpc';

export const createInitializationSlice: StateCreator<DesignSyncStore, [], [], InitializationSlice> = (set, get) => ({
    unsubscribeFirestore: null,
    pegmanState: {
        active: false,
        location: null,
        heading: 0,
        fov: 90
    },

    setPegmanState: (updates) => set((s) => ({
        pegmanState: { ...s.pegmanState, ...updates }
    })),

    initialize: async (projectId: number, projectPath?: string) => {
        const initializeRequestId = incrementInitializeRequestId();
        const normalizedProjectKey = projectPath ?? `id:${projectId}`;
        const {
            projectId: currentProjectId,
            state: currentState,
            isLoading: currentlyLoading
        } = get();

        if (
            currentProjectId === projectId &&
            currentState &&
            !get().error &&
            !currentlyLoading
        ) {
            return;
        }

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
            searchResultMarker: null,
            zoomToTrigger: null
        });

        try {
            let activeProject = await invoke<any>('get_active_project').catch(() => null);
            const needsLoad = !activeProject || Number(activeProject.id) !== projectId;

            if (needsLoad) {
                if (projectPath) {
                    logger.sync(`[Sync] Loading project from: ${projectPath}`);
                    await invoke('load_pmp_file', { path: projectPath });
                } else if (activeProject) {
                    throw new Error(`Phiên làm việc cho dự án ${projectId} đã kết thúc. Vui lòng mở lại tệp.`);
                }
            }

            if (initializeRequestId !== getLatestInitializeRequestId()) return;

            const HYDRATION_TIMEOUT_MS = 120000;
            console.log(`[useDesignSync] Initializing project: ${projectId} (Task: ${initializeRequestId})`);

            const tStart = performance.now();
            let state;
            try {
                state = await invokeBincode('load_design_state', { projectId: String(projectId) }, HYDRATION_TIMEOUT_MS);

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
                    state = await invokeBincode('load_design_state', { projectId: String(projectId) }, HYDRATION_TIMEOUT_MS);
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

            set({
                state,
                lastSync: Date.now()
            });

            // V2 Fix: DO NOT hide any data from database
            // All data is visible by default. Only hide when user clicks the eye icon.
            // mapHiddenIds starts empty - only populated by user actions

            emit('sync-map-state', { state, source: 'initial-load' });
            get().syncDisplayOrderWithSTT();

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
            set({ error: String(err) });
        } finally {
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
