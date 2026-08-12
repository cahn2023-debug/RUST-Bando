import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';

export interface UseMapInteractionsOptions {
    map: maplibregl.Map | null;
    onFeatureClick?: (featureId: string, event: maplibregl.MapMouseEvent) => void;
    onFeatureHover?: (featureId: string | null) => void;
    interactiveLayerIds?: string[];
}

export function useMapInteractions({
    map,
    onFeatureClick,
    onFeatureHover,
    interactiveLayerIds = [],
}: UseMapInteractionsOptions) {
    useEffect(() => {
        if (!map || interactiveLayerIds.length === 0) return;

        const handleClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (!e.features || e.features.length === 0) return;
            const feature = e.features[0];
            const id = feature.properties?.id || feature.id;
            if (id && onFeatureClick) {
                onFeatureClick(String(id), e);
            }
        };

        const handleMouseEnter = () => {
            map.getCanvas().style.cursor = 'pointer';
        };

        const handleMouseLeave = () => {
            map.getCanvas().style.cursor = '';
            if (onFeatureHover) onFeatureHover(null);
        };

        interactiveLayerIds.forEach((layerId) => {
            if (map.getLayer(layerId)) {
                map.on('click', layerId, handleClick);
                map.on('mouseenter', layerId, handleMouseEnter);
                map.on('mouseleave', layerId, handleMouseLeave);
            }
        });

        return () => {
            interactiveLayerIds.forEach((layerId) => {
                if (map.getLayer(layerId)) {
                    map.off('click', layerId, handleClick);
                    map.off('mouseenter', layerId, handleMouseEnter);
                    map.off('mouseleave', layerId, handleMouseLeave);
                }
            });
        };
    }, [map, onFeatureClick, onFeatureHover, interactiveLayerIds]);
}
