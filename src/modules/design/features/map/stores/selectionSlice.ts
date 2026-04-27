import { StateCreator } from 'zustand';
import { SelectionSlice, DesignSyncStore } from './types';

export const createSelectionSlice: StateCreator<DesignSyncStore, [], [], SelectionSlice> = (set, get) => ({
    selectedFeatureId: null,
    selectedGroupId: null,
    selectedPopupLocation: null,
    hoverId: null,
    selectionSet: new Set(),
    boxSelection: null,

    selectFeature: (id: string | null, keepSelection = false, location?: [number, number]) => {
        const currentState = get();

        if (currentState.drawingMode === 'move' && id === null) return;

        if (id === currentState.selectedFeatureId && id !== null && !keepSelection) {
            set({
                selectedFeatureId: null,
                selectedPopupLocation: null,
                editingFeatureId: null,
                previewMetadata: null,
                selectionSet: new Set()
            });
            return;
        }

        if (id && currentState.state?.features?.[id]) {
            const feature = currentState.state.features[id];
            const groupId = feature.group_id;
            const geomType = (feature.geom_type || '').toUpperCase();
            const isVector = geomType === 'LINESTRING' || geomType === 'POLYLINE' || geomType === 'POLYGON';

            const newSelectionSet = keepSelection
                ? new Set(currentState.selectionSet).add(id)
                : new Set([id]);

            set({
                selectedFeatureId: id,
                selectedGroupId: groupId,
                selectedPopupLocation: location || null,
                editingFeatureId: isVector ? id : null,
                previewMetadata: null,
                selectionSet: newSelectionSet
            });
        } else {
            set({
                selectedFeatureId: id,
                selectedPopupLocation: location || null,
                editingFeatureId: null,
                previewMetadata: null,
                selectionSet: keepSelection ? get().selectionSet : new Set()
            });
        }
    },

    setHoverId: (id) => set({ hoverId: id }),
    setBoxSelection: (summary) => set({
        boxSelection: summary,
        selectedFeatureId: summary ? null : get().selectedFeatureId
    }),
    toggleSelection: (id) => {
        const selectionSet = new Set(get().selectionSet);
        if (selectionSet.has(id)) {
            selectionSet.delete(id);
        } else {
            selectionSet.add(id);
        }
        set({ selectionSet });
    },
    selectAll: (ids) => {
        const selectionSet = new Set(get().selectionSet);
        ids.forEach(id => selectionSet.add(id));
        set({ selectionSet });
    },
    clearSelection: () => set({ selectionSet: new Set() }),
    setSelectedGroup: (id) => set({ selectedGroupId: id })
});
