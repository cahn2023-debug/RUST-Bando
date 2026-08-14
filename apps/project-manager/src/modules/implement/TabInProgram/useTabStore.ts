import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TabItem {
    id: string;
    name: string;
    path: string;
}

interface TabState {
    tabs: TabItem[];
    activeTabId: string | null;

    // Actions
    addTab: (tab: TabItem) => void;
    removeTab: (id: string) => void;
    setActiveTab: (id: string) => void;
    updateTabName: (id: string, name: string) => void;
}

export const useTabStore = create<TabState>()(
    persist(
        (set) => ({
            tabs: [],
            activeTabId: null,

            addTab: (tab) =>
                set((state) => {
                    const exists = state.tabs.find((t) => t.path === tab.path || t.id === tab.id);
                    if (exists) {
                        return { activeTabId: exists.id };
                    }
                    return {
                        tabs: [...state.tabs, tab],
                        activeTabId: tab.id,
                    };
                }),

            removeTab: (id) =>
                set((state) => {
                    const newTabs = state.tabs.filter((t) => t.id !== id);
                    let newActiveId = state.activeTabId;

                    if (state.activeTabId === id) {
                        newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
                    }

                    return {
                        tabs: newTabs,
                        activeTabId: newActiveId,
                    };
                }),

            setActiveTab: (id) => set({ activeTabId: id }),

            updateTabName: (id, name) =>
                set((state) => ({
                    tabs: state.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
                })),
        }),
        {
            name: 'tab-storage',
        }
    )
);
