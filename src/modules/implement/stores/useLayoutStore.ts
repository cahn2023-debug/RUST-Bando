import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PaletteConfig {
    id: string;
    title: string;
    icon: string;
    isPinned: boolean;
    isVisible: boolean;
    width: number;
    height?: number;
    flex?: number;
    dockPosition?: 'right' | 'bottom' | 'floating';
    userClosed?: boolean;
    isFloating: boolean;
    position: { x: number; y: number };
}

interface LayoutState {
    layoutColumns: string[][];
    activePaletteId: string | null;
    paletteConfigs: Record<string, PaletteConfig>;
    togglePalette: (id: string) => void;
    setPinned: (id: string, isPinned: boolean) => void;
    updatePaletteWidth: (id: string, width: number) => void;
    updatePaletteHeight: (id: string, height: number) => void;
    updatePaletteFlex: (id: string, flex: number) => void;
    updatePaletteSizeAndPosition: (id: string, width: number, height: number, x: number, y: number) => void;
    closePalette: (id: string) => void;
    expandPalette: (id: string | null) => void;
    setFloating: (id: string, isFloating: boolean, position?: { x: number; y: number }) => void;
    updatePalettePosition: (id: string, x: number, y: number) => void;
    draggingPaletteId: string | null;
    setDraggingPalette: (id: string | null) => void;
    reorderPalettes: (sourceId: string, targetId: string) => void;
    showPerformanceOverlay: boolean;
    setShowPerformanceOverlay: (show: boolean) => void;
    registerPalette: (config: Partial<PaletteConfig> & { id: string }) => void;
}

const DEFAULT_LAYOUT_COLUMNS = [['spec-panel', 'summary-panel', 'camera-view', 'device-config'], ['network-graph']];

const CANONICAL_PALETTE_TITLES: Record<string, string> = {
    'spec-panel': 'Thông số thiết kế',
    'summary-panel': 'Tổng hợp khối lượng',
    'device-config': 'Cấu hình thiết bị',
    'camera-view': 'Góc nhìn',
    'network-graph': 'Network',
};

const getCanonicalPaletteTitle = (id: string, fallback?: string) =>
    CANONICAL_PALETTE_TITLES[id] ?? fallback ?? 'Untitled Palette';

const createDefaultPaletteConfigs = (): Record<string, PaletteConfig> => ({
    'spec-panel': { id: 'spec-panel', title: 'Thông số thiết kế', icon: 'Settings', isPinned: true, isVisible: true, width: 350, dockPosition: 'right', isFloating: false, position: { x: 0, y: 0 } },
    'summary-panel': { id: 'summary-panel', title: 'Tổng hợp khối lượng', icon: 'Calculator', isPinned: true, isVisible: false, width: 350, dockPosition: 'right', isFloating: false, position: { x: 0, y: 0 } },
    'device-config': { id: 'device-config', title: 'Cấu hình thiết bị', icon: 'Camera', isPinned: true, isVisible: false, width: 350, dockPosition: 'right', isFloating: false, position: { x: 0, y: 0 } },
    'camera-view': { id: 'camera-view', title: 'Góc Nhìn', icon: 'Video', isPinned: true, isVisible: false, width: 350, dockPosition: 'right', isFloating: false, position: { x: 0, y: 0 } },
    'network-graph': { id: 'network-graph', title: 'Network', icon: 'Network', isPinned: true, isVisible: false, width: 900, height: 320, dockPosition: 'bottom', isFloating: false, position: { x: 0, y: 0 } },
});

const normalizePaletteConfigs = (paletteConfigs: Record<string, PaletteConfig>): Record<string, PaletteConfig> => {
    const normalized = { ...paletteConfigs };
    Object.entries(normalized).forEach(([id, config]) => {
        normalized[id] = {
            ...config,
            title: getCanonicalPaletteTitle(id, config.title),
        };
    });
    return normalized;
};

export const createDefaultLayoutState = () => ({
    layoutColumns: DEFAULT_LAYOUT_COLUMNS.map((column) => [...column]),
    activePaletteId: null as string | null,
    paletteConfigs: normalizePaletteConfigs(createDefaultPaletteConfigs()),
    draggingPaletteId: null as string | null,
    showPerformanceOverlay: false,
});

const isMalformedPersistedLayout = (state: any) => {
    if (!state || typeof state !== 'object') return true;
    if (!Array.isArray(state.layoutColumns) || state.layoutColumns.length === 0) return true;
    if (!state.paletteConfigs || typeof state.paletteConfigs !== 'object') return true;
    return false;
};

export const migrateLayoutState = (persistedState: any, version: number) => {
    let state = persistedState as any;

    const resetToDefaultLayout = () => {
        const baseline = createDefaultLayoutState();
        state = {
            ...state,
            ...baseline,
            activePaletteId: null,
            draggingPaletteId: null,
            showPerformanceOverlay: false,
        };
    };

    const ensureNetworkPalette = () => {
        if (!state.paletteConfigs) state.paletteConfigs = {};
        state.paletteConfigs['network-graph'] = {
            ...createDefaultPaletteConfigs()['network-graph'],
            ...(state.paletteConfigs['network-graph'] || {}),
        };

        Object.values(state.paletteConfigs).forEach((config: any) => {
            if (!config.dockPosition) {
                config.dockPosition = config.isFloating ? 'floating' : 'right';
            }
        });

        if (!state.layoutColumns || state.layoutColumns.length === 0) {
            state.layoutColumns = DEFAULT_LAYOUT_COLUMNS.map((column) => [...column]);
        }
        if (!state.layoutColumns.some((col: string[]) => col.includes('network-graph'))) {
            state.layoutColumns.push(['network-graph']);
        }
    };

    const stripBulkEditPalette = () => {
        if (state.paletteConfigs) {
            delete state.paletteConfigs['bulk-edit'];
        }
        if (state.layoutColumns) {
            state.layoutColumns = state.layoutColumns
                .map((col: string[]) => col.filter((id) => id !== 'bulk-edit'))
                .filter((col: string[]) => col.length > 0);
        }
        if (state.activePaletteId === 'bulk-edit') state.activePaletteId = null;
        if (state.draggingPaletteId === 'bulk-edit') state.draggingPaletteId = null;
    };

    const normalizePersistedPaletteTitles = () => {
        if (!state.paletteConfigs) return;
        state.paletteConfigs = normalizePaletteConfigs(state.paletteConfigs);
    };

    if (isMalformedPersistedLayout(state)) {
        resetToDefaultLayout();
        return state;
    }

    if (version === 0) {
        if (state.rightPalettes && state.rightPalettes.includes('property-manager')) {
            state.rightPalettes = state.rightPalettes.filter((id: string) => id !== 'property-manager');
            if (!state.rightPalettes.includes('spec-panel')) state.rightPalettes.unshift('spec-panel');
            if (!state.rightPalettes.includes('summary-panel')) state.rightPalettes.splice(1, 0, 'summary-panel');
        }
        if (state.paletteConfigs) {
            if (state.paletteConfigs['property-manager']) {
                const oldConfig = state.paletteConfigs['property-manager'];
                state.paletteConfigs['spec-panel'] = { ...oldConfig, id: 'spec-panel', title: 'Thông số thiết kế', icon: 'Settings' };
                delete state.paletteConfigs['property-manager'];
            }
            if (!state.paletteConfigs['summary-panel']) {
                state.paletteConfigs['summary-panel'] = { id: 'summary-panel', title: 'Tổng hợp khối lượng', icon: 'Calculator', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 100, y: 120 } };
            }
        }
        version = 1;
    }

    if (version === 1) {
        if (state.rightPalettes) {
            state.layoutColumns = [state.rightPalettes];
            delete state.rightPalettes;
        } else {
            state.layoutColumns = [['spec-panel'], ['summary-panel']];
        }
        version = 2;
    }

    if (version === 2) {
        const defaultConfigs: Record<string, PaletteConfig> = {
            'spec-panel': { id: 'spec-panel', title: 'Thông số thiết kế', icon: 'Settings', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 0, y: 0 } },
            'summary-panel': { id: 'summary-panel', title: 'Tổng hợp khối lượng', icon: 'Calculator', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 0, y: 0 } },
            'device-config': { id: 'device-config', title: 'Cấu hình thiết bị', icon: 'Camera', isPinned: false, isVisible: false, width: 350, isFloating: false, position: { x: 0, y: 0 } },
            'camera-view': { id: 'camera-view', title: 'Góc Nhìn', icon: 'Video', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 0, y: 0 } },
        };

        if (!state.paletteConfigs) state.paletteConfigs = {};

        Object.keys(defaultConfigs).forEach((id) => {
            if (!state.paletteConfigs[id]) {
                state.paletteConfigs[id] = defaultConfigs[id];
            }
        });

        if (!state.layoutColumns || state.layoutColumns.length === 0) {
            state.layoutColumns = [['spec-panel'], ['summary-panel']];
        }
        version = 3;
    }

    if (version === 3) {
        if (state.layoutColumns) {
            const hasCameraView = state.layoutColumns.some((col: string[]) => col.includes('camera-view'));
            if (!hasCameraView) {
                if (state.layoutColumns.length >= 2) {
                    state.layoutColumns[1].push('camera-view');
                } else if (state.layoutColumns.length >= 1) {
                    state.layoutColumns[0].push('camera-view');
                } else {
                    state.layoutColumns = [['spec-panel'], ['summary-panel', 'camera-view']];
                }
            }
        }

        if (state.paletteConfigs && state.paletteConfigs['camera-view']) {
            state.paletteConfigs['camera-view'].isVisible = true;
            state.paletteConfigs['camera-view'].title = 'Góc Nhìn';
        }
        version = 4;
    }

    if (version === 4) {
        const cameraViewConfig = { id: 'camera-view', title: 'Góc Nhìn', icon: 'Video', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 0, y: 0 } };

        if (!state.paletteConfigs) state.paletteConfigs = {};

        state.paletteConfigs['camera-view'] = {
            ...cameraViewConfig,
            ...(state.paletteConfigs['camera-view'] || {}),
        };
        state.paletteConfigs['camera-view'].isVisible = true;
        state.paletteConfigs['camera-view'].title = 'Góc Nhìn';

        if (state.layoutColumns) {
            const hasCameraView = state.layoutColumns.some((col: string[]) => col.includes('camera-view'));
            if (!hasCameraView) {
                if (state.layoutColumns.length >= 2) {
                    state.layoutColumns[1].push('camera-view');
                } else if (state.layoutColumns.length >= 1) {
                    state.layoutColumns[0].push('camera-view');
                } else {
                    state.layoutColumns = [['spec-panel'], ['summary-panel', 'camera-view']];
                }
            } else {
                state.layoutColumns = [['spec-panel'], ['summary-panel', 'camera-view']];
            }
        }
        ensureNetworkPalette();
        normalizePersistedPaletteTitles();
        return state;
    }

    if (version < 7) {
        if (state.paletteConfigs) {
            const standardIds = ['spec-panel', 'summary-panel', 'camera-view', 'device-config'];
            standardIds.forEach((id) => {
                if (state.paletteConfigs[id]) {
                    state.paletteConfigs[id].isPinned = true;
                    state.paletteConfigs[id].isVisible = id === 'spec-panel';
                    if (state.paletteConfigs[id].isFloating === undefined) state.paletteConfigs[id].isFloating = false;
                }
            });
        }

        state.layoutColumns = [['spec-panel', 'summary-panel', 'camera-view', 'device-config']];
        stripBulkEditPalette();
        ensureNetworkPalette();
        normalizePersistedPaletteTitles();
        return state;
    }

    if (version < 8) {
        if (state.paletteConfigs) {
            const idsToHide = ['summary-panel'];
            const idsToShow = ['camera-view', 'device-config'];
            idsToHide.forEach((id) => {
                if (state.paletteConfigs[id]) {
                    state.paletteConfigs[id].isVisible = false;
                    state.paletteConfigs[id].isPinned = true;
                }
            });
            idsToShow.forEach((id) => {
                if (state.paletteConfigs[id]) {
                    state.paletteConfigs[id].isVisible = true;
                    state.paletteConfigs[id].isPinned = true;
                }
            });
            if (state.paletteConfigs['spec-panel']) {
                state.paletteConfigs['spec-panel'].isVisible = true;
                state.paletteConfigs['spec-panel'].isPinned = true;
            }
        }
        state.layoutColumns = [['spec-panel', 'summary-panel', 'camera-view', 'device-config']];
        stripBulkEditPalette();
        ensureNetworkPalette();
        normalizePersistedPaletteTitles();
        return state;
    }

    if (version < 9) {
        if (state.paletteConfigs) {
            const palettesToEnable = ['camera-view', 'device-config'];
            palettesToEnable.forEach((id) => {
                if (state.paletteConfigs[id]) {
                    state.paletteConfigs[id].isVisible = true;
                    state.paletteConfigs[id].isPinned = true;
                }
            });
        }
        stripBulkEditPalette();
        ensureNetworkPalette();
        normalizePersistedPaletteTitles();
        return state;
    }

    if (version < 10) {
        ensureNetworkPalette();
        normalizePersistedPaletteTitles();
        return state;
    }

    if (version < 11) {
        resetToDefaultLayout();
        return state;
    }

    if (version < 12) {
        stripBulkEditPalette();
        ensureNetworkPalette();
        normalizePersistedPaletteTitles();
        return state;
    }

    stripBulkEditPalette();
    ensureNetworkPalette();
    normalizePersistedPaletteTitles();
    return state;
};

export const useLayoutStore = create<LayoutState>()(
    persist(
        (set) => ({
            ...createDefaultLayoutState(),
            setShowPerformanceOverlay: (show: boolean) => set({ showPerformanceOverlay: show }),

            togglePalette: (id: string) =>
                set((state) => {
                    const config = state.paletteConfigs[id];
                    if (!config) return state;

                    const isOpening = !config.isVisible;
                    let newColumns = [...state.layoutColumns];

                    if (isOpening) {
                        const exists = newColumns.some((col) => col.includes(id));
                        if (!exists) {
                            if (newColumns.length === 0) newColumns = [[id]];
                            else newColumns[0] = [id, ...newColumns[0]];
                        }
                    }

                    return {
                        paletteConfigs: {
                            ...state.paletteConfigs,
                            [id]: { ...config, isVisible: isOpening, userClosed: isOpening ? false : true },
                        },
                        layoutColumns: newColumns,
                        activePaletteId: isOpening ? id : (state.activePaletteId === id ? null : state.activePaletteId),
                    };
                }),

            setPinned: (id: string, isPinned: boolean) =>
                set((state) => ({
                    paletteConfigs: {
                        ...state.paletteConfigs,
                        [id]: { ...state.paletteConfigs[id], isPinned },
                    },
                })),

            updatePaletteWidth: (id: string, width: number) =>
                set((state) => {
                    const newConfigs = { ...state.paletteConfigs };
                    const column = state.layoutColumns.find((col) => col.includes(id));

                    if (column && !newConfigs[id].isFloating) {
                        column.forEach((paletteId) => {
                            if (newConfigs[paletteId]) {
                                newConfigs[paletteId] = { ...newConfigs[paletteId], width };
                            }
                        });
                    } else if (newConfigs[id]) {
                        newConfigs[id] = { ...newConfigs[id], width };
                    }

                    return { paletteConfigs: newConfigs };
                }),

            updatePaletteHeight: (id: string, height: number) =>
                set((state) => ({
                    paletteConfigs: {
                        ...state.paletteConfigs,
                        [id]: { ...state.paletteConfigs[id], height },
                    },
                })),

            updatePaletteFlex: (id: string, flex: number) =>
                set((state) => ({
                    paletteConfigs: {
                        ...state.paletteConfigs,
                        [id]: { ...state.paletteConfigs[id], flex },
                    },
                })),

            updatePaletteSizeAndPosition: (id: string, width: number, height: number, x: number, y: number) =>
                set((state) => ({
                    paletteConfigs: {
                        ...state.paletteConfigs,
                        [id]: {
                            ...state.paletteConfigs[id],
                            width,
                            height,
                            position: { x, y },
                        },
                    },
                })),

            closePalette: (id: string) =>
                set((state) => ({
                    activePaletteId: state.activePaletteId === id ? null : state.activePaletteId,
                    paletteConfigs: {
                        ...state.paletteConfigs,
                        [id]: { ...state.paletteConfigs[id], isVisible: false, userClosed: true },
                    },
                })),

            expandPalette: (id: string | null) => set({ activePaletteId: id }),

            setFloating: (id: string, isFloating: boolean, position?: { x: number; y: number }) =>
                set((state) => {
                    const config = state.paletteConfigs[id];
                    let newWidth = config.width;

                    if (!isFloating) {
                        const column = state.layoutColumns.find((col) => col.includes(id));
                        if (column) {
                            const otherId = column.find((paletteId) => paletteId !== id && state.paletteConfigs[paletteId].isVisible && !state.paletteConfigs[paletteId].isFloating);
                            if (otherId) {
                                newWidth = state.paletteConfigs[otherId].width;
                            }
                        }
                    }

                    return {
                        paletteConfigs: {
                            ...state.paletteConfigs,
                            [id]: {
                                ...config,
                                isFloating,
                                width: newWidth,
                                position: position || config.position,
                                isPinned: isFloating ? true : config.isPinned,
                            },
                        },
                    };
                }),

            updatePalettePosition: (id: string, x: number, y: number) =>
                set((state) => ({
                    paletteConfigs: {
                        ...state.paletteConfigs,
                        [id]: {
                            ...state.paletteConfigs[id],
                            position: { x, y },
                        },
                    },
                })),

            setDraggingPalette: (id: string | null) => set({ draggingPaletteId: id }),

            reorderPalettes: (sourceId: string, targetId: string) =>
                set((state) => {
                    const sourceColIdx = state.layoutColumns.findIndex((col) => col.includes(sourceId));
                    const targetColIdx = state.layoutColumns.findIndex((col) => col.includes(targetId));

                    if (sourceColIdx === -1 || targetColIdx === -1) return state;

                    const nextLayout = [...state.layoutColumns];
                    const sourceCol = [...nextLayout[sourceColIdx]];
                    const sourceIdx = sourceCol.indexOf(sourceId);

                    sourceCol.splice(sourceIdx, 1);
                    nextLayout[sourceColIdx] = sourceCol;

                    const targetCol = sourceColIdx === targetColIdx ? sourceCol : [...nextLayout[targetColIdx]];
                    const targetIdx = targetCol.indexOf(targetId);

                    targetCol.splice(targetIdx, 0, sourceId);
                    nextLayout[targetColIdx] = targetCol;

                    return { layoutColumns: nextLayout };
                }),

            registerPalette: (config) =>
                set((state) => {
                    const existing = state.paletteConfigs[config.id];
                    if (existing) return state;

                    const defaultConfig: PaletteConfig = {
                        title: getCanonicalPaletteTitle(config.id),
                        icon: 'Settings',
                        isPinned: true,
                        isVisible: false,
                        width: 350,
                        dockPosition: 'right',
                        isFloating: false,
                        position: { x: 0, y: 0 },
                        ...config,
                    };

                    return {
                        paletteConfigs: {
                            ...state.paletteConfigs,
                            [config.id]: defaultConfig,
                        },
                    };
                }),
        }),
        {
            name: 'cad-layout-storage',
            version: 12,
            migrate: migrateLayoutState,
        }
    )
);
