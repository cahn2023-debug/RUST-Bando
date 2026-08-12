import { useShallow } from 'zustand/react/shallow';
import { useDesignSync } from './useDesignSync';

/**
 * useFeatureStore - Specialized hook for accessing and manipulating Features.
 * Implementation follow Phase 4 of the V2 Architecture Stabilization plan.
 */
export const useFeatureStore = () => {
    return useDesignSync(
        useShallow((s) => ({
            features: s.state?.features || {},
            featureGroups: s.state?.feature_groups || {},
            // Actions
            updateMetadata: s.updateEntityMetadataOptimistic,
            applyBatch: s.applyPatchToState,
            // Status
            isSaving: s.isSaving
        }))
    );
};

export const useFeatures = () => useDesignSync(useShallow((s) => s.state?.features || {}));
export const useFeatureGroups = () => useDesignSync(useShallow((s) => s.state?.feature_groups || {}));
