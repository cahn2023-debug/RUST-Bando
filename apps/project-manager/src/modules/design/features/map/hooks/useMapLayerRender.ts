import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';

export interface UseMapLayerRenderOptions {
    map: maplibregl.Map | null;
    layersVisible?: boolean;
}

export function useMapLayerRender({ map, layersVisible = true }: UseMapLayerRenderOptions) {
    useEffect(() => {
        if (!map) return;
        // Quản lý hiển thị layer
        const style = map.getStyle();
        if (!style || !style.layers) return;

        style.layers.forEach((layer) => {
            if (map.getLayer(layer.id)) {
                map.setLayoutProperty(layer.id, 'visibility', layersVisible ? 'visible' : 'none');
            }
        });
    }, [map, layersVisible]);
}
