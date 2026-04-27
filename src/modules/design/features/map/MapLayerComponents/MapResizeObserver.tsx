import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Automatically calls map.invalidateSize() whenever the map container resizes.
 * This fixes visual artifacts (like black streaks) when sidebars or palettes toggle.
 */
export function MapResizeObserver() {
    const map = useMap();

    useEffect(() => {
        if (!map) return;

        const container = map.getContainer();
        if (!container) return;

        const resizeObserver = new ResizeObserver(() => {
            // Request an animation frame to ensure the browser has finished layout
            requestAnimationFrame(() => {
                map.invalidateSize({ animate: true });
            });
        });

        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
        };
    }, [map]);

    return null;
}
