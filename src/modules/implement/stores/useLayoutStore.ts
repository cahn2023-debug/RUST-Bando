import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PaletteConfig {
    id: string;
    title: string;
    icon: string; // Lucide icon name or component
    isPinned: boolean;
    isVisible: boolean;
    width: number;
    height?: number;
    flex?: number; // Added for docked relative height
    isFloating: boolean;
    position: { x: number; y: number };
}

interface LayoutState {
    layoutColumns: string[][]; // Array of columns, each containing an array of palette IDs
    activePaletteId: string | null;
    paletteConfigs: Record<string, PaletteConfig>;

    // Actions
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

export const useLayoutStore = create<LayoutState>()(
    persist(
        (set) => ({
            layoutColumns: [['spec-panel', 'summary-panel', 'camera-view', 'device-config', 'bulk-edit']],
            activePaletteId: null,
            paletteConfigs: {
                'spec-panel': { id: 'spec-panel', title: 'Thông số thiết kế', icon: 'Settings', isPinned: true, isVisible: true, width: 350, isFloating: false, position: { x: 0, y: 0 } },
                'summary-panel': { id: 'summary-panel', title: 'Tổng hợp khối lượng', icon: 'Calculator', isPinned: true, isVisible: false, width: 350, isFloating: false, position: { x: 0, y: 0 } },
                'device-config': { id: 'device-config', title: 'Cấu hình thiết bị', icon: 'Camera', isPinned: true, isVisible: false, width: 350, isFloating: false, position: { x: 0, y: 0 } },
                'camera-view': { id: 'camera-view', title: 'Góc Nhìn', icon: 'Video', isPinned: true, isVisible: false, width: 350, isFloating: false, position: { x: 0, y: 0 } },
                'bulk-edit': { id: 'bulk-edit', title: 'Chỉnh sửa hàng loạt', icon: 'Layers', isPinned: true, isVisible: false, width: 350, isFloating: false, position: { x: 0, y: 0 } },
            },
            draggingPaletteId: null,
            showPerformanceOverlay: false,
            setShowPerformanceOverlay: (show: boolean) => set({ showPerformanceOverlay: show }),

            togglePalette: (id: string) =>
                set((state) => {
                    const config = state.paletteConfigs[id];
                    if (!config) return state;

                    const isOpening = !config.isVisible;
                    let newColumns = [...state.layoutColumns];

                    if (isOpening) {
                        // Check if already in any column
                        const exists = newColumns.some(col => col.includes(id));
                        if (!exists) {
                            // Add to the first column or create one
                            if (newColumns.length === 0) newColumns = [[id]];
                            else newColumns[0] = [id, ...newColumns[0]];
                        }
                    }

                    return {
                        paletteConfigs: {
                            ...state.paletteConfigs,
                            [id]: { ...config, isVisible: isOpening }
                        },
                        layoutColumns: newColumns,
                        activePaletteId: isOpening ? id : (state.activePaletteId === id ? null : state.activePaletteId)
                    };
                }),

            setPinned: (id: string, isPinned: boolean) =>
                set((state) => ({
                    paletteConfigs: {
                        ...state.paletteConfigs,
                        [id]: { ...state.paletteConfigs[id], isPinned }
                    }
                })),

            updatePaletteWidth: (id: string, width: number) =>
                set((state) => {
                    const newConfigs = { ...state.paletteConfigs };
                    const column = state.layoutColumns.find(col => col.includes(id));

                    if (column && !newConfigs[id].isFloating) {
                        column.forEach(pId => {
                            if (newConfigs[pId]) {
                                newConfigs[pId] = { ...newConfigs[pId], width };
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
                        [id]: { ...state.paletteConfigs[id], height }
                    }
                })),

            updatePaletteFlex: (id: string, flex: number) =>
                set((state) => ({
                    paletteConfigs: {
                        ...state.paletteConfigs,
                        [id]: { ...state.paletteConfigs[id], flex }
                    }
                })),

            updatePaletteSizeAndPosition: (id: string, width: number, height: number, x: number, y: number) =>
                set((state) => ({
                    paletteConfigs: {
                        ...state.paletteConfigs,
                        [id]: {
                            ...state.paletteConfigs[id],
                            width,
                            height,
                            position: { x, y }
                        }
                    }
                })),

            closePalette: (id: string) =>
                set((state) => ({
                    activePaletteId: state.activePaletteId === id ? null : state.activePaletteId,
                    paletteConfigs: {
                        ...state.paletteConfigs,
                        [id]: { ...state.paletteConfigs[id], isVisible: false }
                    }
                })),

            expandPalette: (id: string | null) =>
                set({ activePaletteId: id }),

            setFloating: (id: string, isFloating: boolean, position?: { x: number; y: number }) =>
                set((state) => {
                    const config = state.paletteConfigs[id];
                    let newWidth = config.width;

                    if (!isFloating) {
                        // Sync with other palettes in the same column
                        const column = state.layoutColumns.find(col => col.includes(id));
                        if (column) {
                            const otherId = column.find(oid => oid !== id && state.paletteConfigs[oid].isVisible && !state.paletteConfigs[oid].isFloating);
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
                                isPinned: isFloating ? true : config.isPinned
                            }
                        }
                    };
                }),

            updatePalettePosition: (id: string, x: number, y: number) =>
                set((state) => ({
                    paletteConfigs: {
                        ...state.paletteConfigs,
                        [id]: {
                            ...state.paletteConfigs[id],
                            position: { x, y }
                        }
                    }
                })),

            setDraggingPalette: (id: string | null) =>
                set({ draggingPaletteId: id }),

            reorderPalettes: (sourceId: string, targetId: string) =>
                set((state) => {
                    const sourceColIdx = state.layoutColumns.findIndex(col => col.includes(sourceId));
                    const targetColIdx = state.layoutColumns.findIndex(col => col.includes(targetId));

                    if (sourceColIdx === -1 || targetColIdx === -1) return state;

                    const nextLayout = [...state.layoutColumns];
                    const sourceCol = [...nextLayout[sourceColIdx]];
                    const sourceIdx = sourceCol.indexOf(sourceId);

                    // Remove from source
                    sourceCol.splice(sourceIdx, 1);
                    nextLayout[sourceColIdx] = sourceCol;

                    // Insert into target
                    const targetCol = sourceColIdx === targetColIdx ? sourceCol : [...nextLayout[targetColIdx]];
                    const targetIdx = targetCol.indexOf(targetId);

                    targetCol.splice(targetIdx, 0, sourceId);
                    nextLayout[targetColIdx] = targetCol;

                    return { layoutColumns: nextLayout };
                }),

            registerPalette: (config) =>
                set((state) => {
                    const existing = state.paletteConfigs[config.id];
                    if (existing) return state; // Already registered

                    const defaultConfig: PaletteConfig = {
                        title: 'Untitled Palette',
                        icon: 'Settings',
                        isPinned: true,
                        isVisible: false,
                        width: 350,
                        isFloating: false,
                        position: { x: 0, y: 0 },
                        ...config
                    };

                    return {
                        paletteConfigs: {
                            ...state.paletteConfigs,
                            [config.id]: defaultConfig
                        }
                    };
                }),
        }),
        {
            name: 'cad-layout-storage',
            version: 8,
            migrate: (persistedState: any, version: number) => {
                let state = persistedState as any;
                if (version === 0) {
                    // version 0 to 1 logic
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
                    // version 1 to 2: migrate rightPalettes to layoutColumns
                    if (state.rightPalettes) {
                        state.layoutColumns = [state.rightPalettes];
                        delete state.rightPalettes;
                    } else {
                        state.layoutColumns = [['spec-panel'], ['summary-panel']];
                    }
                    version = 2;
                }

                if (version === 2) {
                    // version 2 to 3: ensure all palettes exist in paletteConfigs
                    const defaultConfigs: any = {
                        'spec-panel': { id: 'spec-panel', title: 'Thông số thiết kế', icon: 'Settings', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 0, y: 0 } },
                        'summary-panel': { id: 'summary-panel', title: 'Tổng hợp khối lượng', icon: 'Calculator', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 0, y: 0 } },
                        'device-config': { id: 'device-config', title: 'Cấu hình thiết bị', icon: 'Camera', isPinned: false, isVisible: false, width: 350, isFloating: false, position: { x: 0, y: 0 } },
                        'camera-view': { id: 'camera-view', title: 'Góc Nhìn', icon: 'Video', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 0, y: 0 } },
                        'bulk-edit': { id: 'bulk-edit', title: 'Chỉnh sửa hàng loạt', icon: 'Layers', isPinned: false, isVisible: false, width: 350, isFloating: false, position: { x: 0, y: 0 } }
                    };

                    if (!state.paletteConfigs) state.paletteConfigs = {};

                    Object.keys(defaultConfigs).forEach(id => {
                        if (!state.paletteConfigs[id]) {
                            state.paletteConfigs[id] = defaultConfigs[id];
                        }
                    });

                    // Ensure layoutColumns is initialized and contains these if missing
                    if (!state.layoutColumns || state.layoutColumns.length === 0) {
                        state.layoutColumns = [['spec-panel'], ['summary-panel']];
                    }
                    version = 3;
                }

                if (version === 3) {
                    // version 3 to 4: Force 'camera-view' into layoutColumns if missing
                    if (state.layoutColumns) {
                        const hasCameraView = state.layoutColumns.some((col: string[]) => col.includes('camera-view'));
                        if (!hasCameraView) {
                            // Add to the second column (summary-panel) if possible
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
                    // version 4 to 5: Robust fix for 'camera-view'
                    const cameraViewConfig = { id: 'camera-view', title: 'Góc Nhìn', icon: 'Video', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 0, y: 0 } };

                    if (!state.paletteConfigs) state.paletteConfigs = {};

                    // Force config injection
                    state.paletteConfigs['camera-view'] = {
                        ...cameraViewConfig,
                        ...(state.paletteConfigs['camera-view'] || {})
                    };
                    state.paletteConfigs['camera-view'].isVisible = true;
                    state.paletteConfigs['camera-view'].title = 'Góc Nhìn';

                    // Force layout injection
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
                    return state;
                }

                if (version < 7) {
                    // version to 7: Force pinning for all palettes to fix 'black screen' layout collapse
                    if (state.paletteConfigs) {
                        const standardIds = ['spec-panel', 'summary-panel', 'camera-view', 'device-config', 'bulk-edit'];
                        standardIds.forEach(id => {
                            if (state.paletteConfigs[id]) {
                                state.paletteConfigs[id].isPinned = true;
                                state.paletteConfigs[id].isVisible = (id === 'spec-panel'); // Only spec open by default
                                if (state.paletteConfigs[id].isFloating === undefined) state.paletteConfigs[id].isFloating = false;
                            }
                        });
                    }

                    // Force the standard columns layout (single column for more space)
                    state.layoutColumns = [['spec-panel', 'summary-panel', 'camera-view', 'device-config', 'bulk-edit']];
                    return state;
                }

                if (version < 8) {
                    // version 8: Refine visibility to maximize map space
                    if (state.paletteConfigs) {
                        const idsToHide = ['summary-panel', 'bulk-edit'];
                        const idsToShow = ['camera-view', 'device-config'];
                        idsToHide.forEach(id => {
                            if (state.paletteConfigs[id]) {
                                state.paletteConfigs[id].isVisible = false;
                                state.paletteConfigs[id].isPinned = true;
                            }
                        });
                        idsToShow.forEach(id => {
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
                    state.layoutColumns = [['spec-panel', 'summary-panel', 'camera-view', 'device-config', 'bulk-edit']];
                    return state;
                }

                if (version < 9) {
                    // version 9: Ensure critical palettes are visible even if already on v8
                    if (state.paletteConfigs) {
                        const palettesToEnable = ['camera-view', 'device-config'];
                        palettesToEnable.forEach(id => {
                            if (state.paletteConfigs[id]) {
                                state.paletteConfigs[id].isVisible = true;
                                state.paletteConfigs[id].isPinned = true;
                            }
                        });
                    }
                    return state;
                }
                return state;
            }
        }
    )
);
