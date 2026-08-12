import { StateCreator } from 'zustand';
import { LayoutState } from './types';

export interface ModalSlice {
    activeModalId: string | null;
    openModal: (id: string) => void;
    closeModal: () => void;
}

export const createModalSlice: StateCreator<LayoutState, [], [], ModalSlice> = (set) => ({
    activeModalId: null,
    openModal: (id: string) => set({ activeModalId: id }),
    closeModal: () => set({ activeModalId: null }),
});
