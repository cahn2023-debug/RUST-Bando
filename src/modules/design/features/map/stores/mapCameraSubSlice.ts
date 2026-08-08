import type { StateCreator } from 'zustand';
import { MapState } from '@CONTRACT/types';
import { normalizeFeatureForDisplay } from '../../../../tool/utils/normalizeDisplay';
import type { DesignSyncStore, MapStateSlice } from './types';

type MapStateSet = Parameters<StateCreator<DesignSyncStore, [], [], MapStateSlice>>[0];

const buildViewportSignature = (
    features: MapState['features'][string][],
    total: number,
    truncated: boolean,
    mapRevision: number
) => [
    mapRevision,
    total,
    truncated ? 1 : 0,
    features.map((feature: any) => [
        feature?.id || '',
        feature?.updated_at || feature?.updatedAt || feature?.revision || feature?.version || '',
    ].join('@')).join('|'),
].join('::');

export const createMapCameraSubSlice = (set: MapStateSet): Pick<
    MapStateSlice,
    | 'visibleFeatures'
    | 'visibleFeatureIds'
    | 'featureDetailsCache'
    | 'viewportRevision'
    | 'viewportSignature'
    | 'isViewportLoading'
    | 'viewportFeatureTotal'
    | 'isViewportTruncated'
    | 'mapRenderEngine'
    | 'renderMetrics'
    | 'openMetrics'
    | 'setViewportFeatures'
    | 'setViewportLoading'
    | 'setMapRenderEngine'
    | 'setRenderMetrics'
    | 'updateOpenMetrics'
    | 'cacheFeatureDetail'
> => ({
    visibleFeatures: {},
    visibleFeatureIds: [],
    featureDetailsCache: {},
    viewportRevision: 0,
    viewportSignature: '',
    isViewportLoading: false,
    viewportFeatureTotal: 0,
    isViewportTruncated: false,
    mapRenderEngine: 'maplibre-fast',
    renderMetrics: null,
    openMetrics: null,

    setViewportFeatures: (features, total, truncated) => {
        set((s) => {
            const viewportSignature = buildViewportSignature(features, total, truncated, s.state?.mapRevision || 0);
            if (viewportSignature === s.viewportSignature) {
                return s;
            }
            const normalizedFeatures = features.map(feature =>
                normalizeFeatureForDisplay(feature, undefined, s.state?.feature_groups?.[feature.group_id as string])
            );
            const visibleFeatures = Object.fromEntries(normalizedFeatures.map(feature => [feature.id, feature]));
            let featureDetailsCache = s.featureDetailsCache;
            if (normalizedFeatures.length > 0) {
                featureDetailsCache = { ...s.featureDetailsCache };
                normalizedFeatures.forEach(feature => {
                    featureDetailsCache[feature.id] = feature;
                });
            }
            return {
                visibleFeatures,
                visibleFeatureIds: normalizedFeatures.map(feature => feature.id),
                viewportFeatureTotal: total,
                isViewportTruncated: truncated,
                featureDetailsCache,
                viewportRevision: s.viewportRevision + 1,
                viewportSignature
            };
        });
    },

    setViewportLoading: (isViewportLoading) => set({ isViewportLoading }),

    setMapRenderEngine: (mapRenderEngine) => set({ mapRenderEngine }),

    setRenderMetrics: (renderMetrics) => set({ renderMetrics }),

    updateOpenMetrics: (metrics) => set((s) => ({
        openMetrics: {
            ...(s.openMetrics || {}),
            ...metrics
        }
    })),

    cacheFeatureDetail: (feature) => set((s) => ({
        featureDetailsCache: {
            ...s.featureDetailsCache,
            [feature.id]: feature
        },
        visibleFeatures: s.visibleFeatures[feature.id]
            ? { ...s.visibleFeatures, [feature.id]: feature }
            : s.visibleFeatures
    })),
});
