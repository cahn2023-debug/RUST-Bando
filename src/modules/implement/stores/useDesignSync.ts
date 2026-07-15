import { create } from 'zustand';
import { DesignSyncStore } from '../../design/features/map/stores/types';
import { createMapStateSlice } from '../../design/features/map/stores/mapStateSlice';
import { createSelectionSlice } from '../../design/features/map/stores/selectionSlice';
import { createDrawingSlice } from '../../design/features/map/stores/drawingSlice';
import { createUIControlSlice } from '../../design/features/map/stores/uiControlSlice';
import { createInitializationSlice } from '../../design/features/map/stores/initializationSlice';
import { createDesignActionSlice } from '../../design/features/map/stores/designActionSlice';
import { createUISyncSlice } from '../../design/features/map/stores/uiSyncSlice';

/**
 * useDesignSync - The central store for Map/Design data and interaction.
 * 
 * V5.3: This store has been decomposed into specialized slices:
 * - Map State: Features, layers, regions, and settings.
 * - Selection: Hover, single/multi-select, and box selection.
 * - Drawing: Drawing modes, points, and feature editing.
 * - UI Control: Toggling panels, DORIs, notes, and zoom.
 * - Initialization: Project loading and Pegman state.
 * - Actions: Coordinated dispatching and history management.
 */
export const useDesignSync = create<DesignSyncStore>()((...a) => ({
  ...createMapStateSlice(...a),
  ...createSelectionSlice(...a),
  ...createDrawingSlice(...a),
  ...createUIControlSlice(...a),
  ...createInitializationSlice(...a),
  ...createUISyncSlice(...a),
  ...createDesignActionSlice(...a),
}));

// Re-export common types for convenience
export * from '../../design/features/map/stores/types';
