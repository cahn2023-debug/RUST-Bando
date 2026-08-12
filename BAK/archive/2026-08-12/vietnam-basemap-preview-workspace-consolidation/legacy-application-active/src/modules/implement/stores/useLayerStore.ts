import { useShallow } from 'zustand/react/shallow';
import { useDesignSync } from './useDesignSync';

/**
 * useLayerStore - Specialized hook for layer management.
 * Provides access to layers and active layer state without triggering re-renders
 * for unrelated state changes (like feature property updates).
 */
export const useLayerStore = () => {
    return useDesignSync(
        useShallow((s) => ({
            layers: s.state?.layers || {},
            activeLayerId: s.state?.settings?.active_layer_id || null,
            // Actions
            applyBatch: s.applyPatchToState,
        }))
    );
};

export const useLayers = () => useDesignSync(useShallow((s) => s.state?.layers || {}));
