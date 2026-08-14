import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { MapLibreRenderFeatureCollection } from '../mapLibreFastTypes';

export interface UseMapLayerRenderOptions {
    map: maplibregl.Map | null;
    sourceId: string;
    featureCollection: MapLibreRenderFeatureCollection;
    clusterSourceId?: string;
    clusterCollection?: MapLibreRenderFeatureCollection;
}

export function useMapLayerRender({
    map,
    sourceId,
    featureCollection,
    clusterSourceId,
    clusterCollection,
}: UseMapLayerRenderOptions) {
    useEffect(() => {
        if (!map) return;

        const mainSource = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (mainSource) {
            mainSource.setData(featureCollection as any);
        }

        if (clusterSourceId) {
            const clusterSource = map.getSource(clusterSourceId) as maplibregl.GeoJSONSource | undefined;
            if (clusterSource && clusterCollection) {
                clusterSource.setData(clusterCollection as any);
            }
        }
    }, [map, sourceId, featureCollection, clusterSourceId, clusterCollection]);
}
