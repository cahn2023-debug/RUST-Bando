import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PaletteConfig, LayoutState } from './slices/types';
import {
    createDefaultLayoutState,
    migrateLayoutState,
    getCanonicalPaletteTitle,
    PALETTE_SIDEBAR_WIDTH,
} from './slices/layoutMigration';

export type { PaletteConfig, LayoutState };
export { PALETTE_SIDEBAR_WIDTH, createDefaultLayoutState, migrateLayoutState };

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
            updateLeftWidth: (width: number) => set({ leftWidth: width }),
        }),
        {
            name: 'cad-layout-storage',
            version: 12,
            migrate: migrateLayoutState,
        }
    )
);
