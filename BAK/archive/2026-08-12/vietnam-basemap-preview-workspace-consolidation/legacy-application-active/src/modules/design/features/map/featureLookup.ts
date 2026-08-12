import type { FeatureState, MapState } from '@CONTRACT/types';

export const getRenderableFeatureById = (
    id: string | null | undefined,
    sources: {
        state?: MapState | null;
        visibleFeatures?: Record<string, FeatureState> | null;
        featureDetailsCache?: Record<string, FeatureState> | null;
    }
): FeatureState | null => {
    if (!id) return null;
    return (
        sources.state?.features?.[id] ||
        sources.visibleFeatures?.[id] ||
        sources.featureDetailsCache?.[id] ||
        null
    );
};
