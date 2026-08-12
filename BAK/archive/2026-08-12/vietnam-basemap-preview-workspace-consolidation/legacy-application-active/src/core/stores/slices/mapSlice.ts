import { StateCreator } from 'zustand';
import { LayoutState } from './types';

export interface MapSlice {
    showPerformanceOverlay: boolean;
    setShowPerformanceOverlay: (show: boolean) => void;
}

export const createMapSlice: StateCreator<LayoutState, [], [], MapSlice> = (set) => ({
    showPerformanceOverlay: false,
    setShowPerformanceOverlay: (show: boolean) => set({ showPerformanceOverlay: show }),
});
