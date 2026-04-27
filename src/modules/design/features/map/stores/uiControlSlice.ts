import { StateCreator } from 'zustand';
import { UIControlSlice, DesignSyncStore } from './types';
import { emit } from '@tauri-apps/api/event';

export const createUIControlSlice: StateCreator<DesignSyncStore, [], [], UIControlSlice> = (set, get) => ({
    isCoordinatePanelOpen: false,
    showDORILayers: false,
    showDORIHeatmap: false,
    showFeatureGroups: true,
    showNotes: true,
    showQr: true,
    showCode: true,
    isAnyDialogOpen: false,
    zoomExtendTrigger: 0,
    zoomToTrigger: null,
    previewMetadata: null,
    groupThemePreview: null,
    searchResultMarker: null,
    printArea: null,
    mapHiddenIds: new Set<string>(),

    toggleCoordinatePanel: () => set((state) => ({ isCoordinatePanelOpen: !state.isCoordinatePanelOpen })),

    setShowDORILayers: (show) => {
        set({ showDORILayers: show });
        emit('sync-dori-layers', { show });
    },

    setShowDORIHeatmap: (show) => {
        set({ showDORIHeatmap: show });
        emit('sync-dori-heatmap', { show });
    },

    setShowFeatureGroups: (show) => {
        set({ showFeatureGroups: show });
        emit('sync-feature-groups', { show });
    },

    setShowNotes: (show) => {
        set({ showNotes: show });
        emit('sync-explorer-notes', { show });
    },

    setShowQr: (show) => {
        set({ showQr: show });
        emit('sync-explorer-qr', { show });
    },

    setShowCode: (show) => {
        set({ showCode: show });
        emit('sync-explorer-code', { show });
    },

    setAnyDialogOpen: (open) => set({ isAnyDialogOpen: open }),

    triggerZoomExtend: () => set((state) => ({ zoomExtendTrigger: state.zoomExtendTrigger + 1 })),

    zoomTo: (id, type, location) => {
        const trigger = { id, type, location, timestamp: Date.now() };
        set({ zoomToTrigger: trigger });
        emit('sync-zoom-to', trigger);
    },

    setPreview: (id, metadata) => {
        set({ previewMetadata: id && metadata ? { id, metadata } : null });
        emit('sync-preview-metadata', { id, metadata });
    },

    setGroupThemePreview: (groupId, config) => {
        set({ groupThemePreview: groupId && config ? { groupId, config } : null });
        emit('sync-group-theme-preview', { groupId, config });
    },

    setSearchResultMarker: (marker) => set({ searchResultMarker: marker }),

    setPrintArea: (bounds) => {
        const currentBounds = get().printArea;
        if (JSON.stringify(currentBounds) !== JSON.stringify(bounds)) {
            set({ printArea: bounds });
            emit('sync-print-area', { bounds });
        }
    },

    toggleMapHidden: (id: string) => {
        set((state) => {
            const newSet = new Set(state.mapHiddenIds);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return { mapHiddenIds: newSet };
        });
    }
});
