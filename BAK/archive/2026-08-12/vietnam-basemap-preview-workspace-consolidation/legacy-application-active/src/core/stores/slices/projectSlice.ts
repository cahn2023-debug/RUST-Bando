import { StateCreator } from 'zustand';
import { LayoutState } from './types';

export interface ProjectSlice {
    activeProjectId: string | null;
    setActiveProjectId: (id: string | null) => void;
}

export const createProjectSlice: StateCreator<LayoutState, [], [], ProjectSlice> = (set) => ({
    activeProjectId: null,
    setActiveProjectId: (id: string | null) => set({ activeProjectId: id }),
});
