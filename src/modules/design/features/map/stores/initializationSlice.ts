import { StateCreator } from 'zustand';
import { InitializationSlice, DesignSyncStore } from './types';
import { safeInvoke as invoke } from '../../../../implement/lib/tauri';
import { emit, listen } from '@tauri-apps/api/event';
import { logger } from '../../../../tool/utils/logger';
import {
    incrementInitializeRequestId,
    getLatestInitializeRequestId,
    loadDesignState
} from '../../../../tool/utils/designIpc';

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

            // 🔥 [Giai đoạn Fix Bọc Thép 1.1]: "Sếp bảo vứt hết reduce, cứ map cho anh"
            if (state && state.features) {
                const featureArrayRaw = Array.isArray(state.features) ? state.features : Object.values(state.features);

                // 1. Phỏng vấn tọa độ của feature đầu tiên để bắt thóp CRS
                if (featureArrayRaw.length > 0) {
                    const first = featureArrayRaw[0];
                    console.log("📌 [Hydration] 1st Feature Coords (Raw):", first.coordinates);
                    console.log("📌 [Hydration] 1st Feature BBOX (Raw):", first.bbox);
                }

                // V4 Fix: Heavy lifting is now done by getParsedCoordinates in the layer components.
                // Here we just normalize IDs and properties.
                const totalLoad = featureArrayRaw.length;
                const validCoordsCount = featureArrayRaw.filter((f: any) => {
                    const c = f.coordinates;
                    return c && c !== 'null' && c !== '""';
                }).length;

                console.log(`🔥 [Hydration] Sếp ơi, đã nạp xong ${totalLoad} features từ Backend.`);
                console.log(`📡 [Hydration] Trong đó có ${validCoordsCount} features có tọa độ hợp lệ (non-null).`);

                if (totalLoad > 0) {
                    console.log("🛑 [CHỐT HẠ] TOÀN BỘ NỘI DUNG 1 FEATURE TỪ RUST:", featureArrayRaw[0]);
                    console.log(`🧪 [Hydration] Sample feature coordinate format:`, featureArrayRaw[0].coordinates);
                }

                // 3. Nạp vào Record (Vì UI và Hooks dùng Record[id] để query cho cực nhanh)
                const featureRecord = featureArrayRaw.reduce((acc: any, f: any, index: number) => {
                    const validId = f.id || f.feature_id || f.uuid;
                    if (validId) {
                        // 1. Ép properties về Object
                        let parsedProps = f.properties;
                        if (typeof parsedProps === 'string') {
                            try {
                                parsedProps = JSON.parse(parsedProps);
                            } catch (e) {
                                parsedProps = {};
                            }
                        }

                        // ==========================================
                        // 🚨 2. TRUY LÙNG TỌA ĐỘ VÀ BBOX (BỌC THÉP V4)
                        // ==========================================
                        let finalCoords = f.coordinates;

                        // Lật tung sample để soi key C# (chỉ log 1 lần cho feature đầu hoặc ID cụ thể)
                        if (index === 0) {
                            console.log("🕵️ [Hydration] LẬT TUNG PROPERTIES TÌM TỌA ĐỘ:", parsedProps);
                        }

                        // A. Bình thường hóa tọa độ
                        if (typeof finalCoords === 'string') {
                            try { finalCoords = JSON.parse(finalCoords); } catch (e) { }
                        }
                        if (finalCoords && typeof finalCoords === 'object' && !Array.isArray(finalCoords) && Object.keys(finalCoords).length === 0) {
                            finalCoords = null;
                        }

                        // B. Dò tìm tọa độ từ properties (C# Legacy)
                        const rawLat = parsedProps?.Latitude || parsedProps?.latitude || parsedProps?.Lat || parsedProps?.lat || parsedProps?.Y || parsedProps?.y || parsedProps?.Location?.Latitude;
                        const rawLng = parsedProps?.Longitude || parsedProps?.longitude || parsedProps?.Lng || parsedProps?.lng || parsedProps?.X || parsedProps?.x || parsedProps?.Location?.Longitude;

                        if (rawLat !== undefined && rawLng !== undefined) {
                            // Ép mốc tọa độ về mảng chuẩn của Leaflet/MapLibre [lng, lat]
                            finalCoords = [Number(rawLng), Number(rawLat)];
                        } else {
                            // Luồng backup tìm trong các key phổ biến khác
                            finalCoords = finalCoords
                                || parsedProps?.coordinates
                                || parsedProps?.Coordinates
                                || parsedProps?.geometry?.coordinates
                                || parsedProps?.location?.coordinates
                                || parsedProps?.Location?.coordinates;
                        }

                        // C. Xử lý BBOX
                        let finalBbox = f.bbox || parsedProps?.bbox || parsedProps?.BBox;
                        if (typeof finalBbox === 'string') {
                            try {
                                finalBbox = JSON.parse(finalBbox);
                            } catch (e) {
                                finalBbox = null;
                            }
                        }

                        // Tự sinh BBOX nếu tìm được mảng tọa độ [lng, lat] nhưng thiếu BBOX
                        if (!finalBbox && Array.isArray(finalCoords) && finalCoords.length >= 2) {
                            if (typeof finalCoords[0] === 'number') {
                                finalBbox = {
                                    min_x: finalCoords[0],
                                    max_x: finalCoords[0],
                                    min_y: finalCoords[1],
                                    max_y: finalCoords[1]
                                };
                            }
                        }

                        // 4. Ghi vào Record
                        acc[validId] = {
                            ...f,
                            id: validId,
                            properties: parsedProps || {},
                            coordinates: finalCoords,
                            bbox: finalBbox
                        };
                    }
                    return acc;
                }, {});

                console.log(`🔥 [Hydration] Sếp ơi, đã nạp xong ${featureArrayRaw.length} features vào Store (Record format).`);

                // Cập nhật lại state
                state.features = featureRecord;
            }

            // Ensure state structure is complete
            if (state) {
                if (!state.regions) state.regions = {};
                if (!state.layers) state.layers = {};
                if (!state.feature_groups) state.feature_groups = {};
                if (!state.features) state.features = {};
                if (!state.settings) state.settings = {};
            }

            set({
                state,
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

            emit('sync-map-state', { state, source: 'initial-load' });
            await get().syncDisplayOrderWithSTT();
            console.log(`[Store] Hydration and Display Sync complete for project: ${projectId}`);

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


