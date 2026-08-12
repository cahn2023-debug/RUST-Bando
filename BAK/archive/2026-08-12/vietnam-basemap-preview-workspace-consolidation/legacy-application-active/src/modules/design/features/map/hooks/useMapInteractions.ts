import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';

export interface UseMapInteractionsOptions {
    map: maplibregl.Map | null;
    onFeatureClick?: (featureId: string, coords: [number, number]) => void;
}

export function useMapInteractions({ map, onFeatureClick }: UseMapInteractionsOptions) {
    useEffect(() => {
        if (!map) return;

        const handleClick = (e: maplibregl.MapMouseEvent) => {
            const features = map.queryRenderedFeatures(e.point);
            if (features.length > 0 && onFeatureClick) {
                const f = features[0];
                const id = f.id ? String(f.id) : (f.properties?.id || '');
                onFeatureClick(id, [e.lngLat.lng, e.lngLat.lat]);
            }
        };

        map.on('click', handleClick);
        return () => {
            map.off('click', handleClick);
        };
    }, [map, onFeatureClick]);
}
