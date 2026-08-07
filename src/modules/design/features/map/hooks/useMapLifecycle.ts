import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

export interface UseMapLifecycleOptions {
    containerRef: React.RefObject<HTMLDivElement | null>;
    styleUrl?: string;
    onMapLoad?: (map: maplibregl.Map) => void;
}

export function useMapLifecycle({ containerRef, styleUrl, onMapLoad }: UseMapLifecycleOptions) {
    const mapInstanceRef = useRef<maplibregl.Map | null>(null);

    useEffect(() => {
        if (!containerRef.current || mapInstanceRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: styleUrl || {
                version: 8,
                sources: {},
                layers: [],
            },
            center: [105.85, 21.02],
            zoom: 12,
        });

        map.on('load', () => {
            mapInstanceRef.current = map;
            if (onMapLoad) onMapLoad(map);
        });

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [containerRef, styleUrl, onMapLoad]);

    return { map: mapInstanceRef.current };
}
