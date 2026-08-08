import type { MapLibreRenderFeatureCollection } from '../mapLibreFastTypes';
import type { MapRenderFlags } from '../render/overlayTypes';

const isPointGeometry = (geometryType: string) => geometryType === 'Point' || geometryType === 'MultiPoint';

export const withoutPointFeatures = (
    collection: MapLibreRenderFeatureCollection
): MapLibreRenderFeatureCollection => ({
    ...collection,
    features: collection.features.filter(feature => !isPointGeometry(feature.geometry.type)),
});

export const onlyClusterablePointFeatures = (
    collection: MapLibreRenderFeatureCollection
): MapLibreRenderFeatureCollection => ({
    ...collection,
    features: collection.features.filter(feature => {
        const props = feature.properties as Record<string, any> | undefined;
        return (
            isPointGeometry(feature.geometry.type) &&
            props?.geomType !== 'line' &&
            !Boolean(props?.isIntersectionChild)
        );
    }),
});

const emptyLike = (collection: MapLibreRenderFeatureCollection): MapLibreRenderFeatureCollection => ({
    ...collection,
    features: [],
});

export const buildPointClusteringCollections = ({
    collection,
    clusterPoints,
    overlayPoints,
}: {
    collection: MapLibreRenderFeatureCollection;
    clusterPoints: boolean;
    overlayPoints: boolean;
}) => ({
    mainCollection: withoutPointFeatures(collection),
    clusterCollection: clusterPoints || !overlayPoints
        ? onlyClusterablePointFeatures(collection)
        : emptyLike(collection),
});

export const resolvePointOverlayRenderFlags = (
    renderFlags: MapRenderFlags,
    clusterPoints: boolean
): MapRenderFlags => (
    clusterPoints
        ? { ...renderFlags, overlayPoints: false }
        : renderFlags
);
