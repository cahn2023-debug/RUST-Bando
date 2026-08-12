import { useShallow } from 'zustand/react/shallow';
import { useDesignSync } from './useDesignSync';

/**
 * useRegionStore - Specialized hook for region management.
 */
export const useRegionStore = () => {
    return useDesignSync(
        useShallow((s) => ({
            regions: s.state?.regions || {},
            // Actions
            applyBatch: s.applyPatchToState,
        }))
    );
};

export const useRegions = () => useDesignSync(useShallow((s) => s.state?.regions || {}));
