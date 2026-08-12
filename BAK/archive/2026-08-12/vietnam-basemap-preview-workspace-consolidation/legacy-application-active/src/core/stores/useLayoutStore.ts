import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PaletteConfig, LayoutState } from './slices/types';
import {
    createDefaultLayoutState,
    migrateLayoutState,
    PALETTE_SIDEBAR_WIDTH,
} from './slices/layoutMigration';
import { createLayoutSlice } from './slices/layoutSlice';
import { createMapSlice } from './slices/mapSlice';
import { createModalSlice } from './slices/modalSlice';
import { createProjectSlice } from './slices/projectSlice';

export type { PaletteConfig, LayoutState };
export { PALETTE_SIDEBAR_WIDTH, createDefaultLayoutState, migrateLayoutState };

export const useLayoutStore = create<LayoutState>()(
    persist(
        (...a) => ({
            ...createLayoutSlice(...a),
            ...createMapSlice(...a),
            ...createModalSlice(...a),
            ...createProjectSlice(...a),
        }),
        {
            name: 'cad-layout-storage',
            version: 12,
            migrate: migrateLayoutState,
        }
    )
);


