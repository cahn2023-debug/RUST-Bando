/**
 * SmoothZoomController - Google Maps Style Zoom Animations
 * 
 * Provides smooth zoom animations matching Google Maps behavior:
 * - Duration: 800ms (Google Maps default)
 * - Easing: ease-out quad (t * (2 - t))
 * - Smooth panning with no jarring jumps
 * 
 * Usage:
 * ```typescript
 * import { smoothZoomToFeature, smoothPanTo } from '@DESIGN/feature/map/SmoothZoomController';
 * 
 * // Zoom to point with Google Maps-style animation
 * smoothZoomToFeature(map, feature, 18);
 * 
 * // Pan to location smoothly
 * smoothPanTo(map, [lat, lng]);
 * ```
 */

import L from 'leaflet';

/**
 * Google Maps Easing Function
 * ease-out quad: t * (2 - t)
 * This creates a smooth deceleration curve
 */
export function googleMapsEasing(t: number): number {
    return t * (2 - t);
}

/**
 * Smooth Zoom To Location
 * Google Maps-style zoom animation
 * 
 * @param map - Leaflet map instance
 * @param latlng - Target location [lat, lng]
 * @param zoom - Target zoom level
 * @param options - Animation options
 */
export function smoothZoomTo(
    map: L.Map,
    latlng: [number, number],
    zoom: number = 18,
    options?: {
        duration?: number;
        easeLinearity?: number;
    }
) {
    const {
        duration = 0.8,  // Google Maps default: 800ms
        easeLinearity = 0.15  // Smoother than Leaflet's 0.25
    } = options || {};

    map.setView(latlng, zoom, {
        animate: true,
        duration,
        easeLinearity,
        noMoveStart: true  // Don't fire 'movestart' event
    });
}

/**
 * Smooth Pan To Location
 * Google Maps-style pan animation (keeps current zoom)
 * 
 * @param map - Leaflet map instance
 * @param latlng - Target location [lat, lng]
 * @param options - Animation options
 */
export function smoothPanTo(
    map: L.Map,
    latlng: [number, number],
    options?: {
        duration?: number;
        easeLinearity?: number;
    }
) {
    const currentZoom = map.getZoom();

    map.setView(latlng, currentZoom, {
        animate: true,
        duration: options?.duration || 0.5,
        easeLinearity: options?.easeLinearity || 0.15,
        noMoveStart: true
    });
}

/**
 * Smooth Zoom To Feature
 * Automatically detects geometry type and zooms appropriately
 * 
 * @param map - Leaflet map instance
 * @param feature - Feature object with coordinates and geom_type
 * @param defaultZoom - Default zoom level for points
 */
export function smoothZoomToFeature(
    map: L.Map,
    feature: {
        coordinates: string | number[];
        geom_type?: string;
    },
    defaultZoom: number = 18
) {
    try {
        const coords = typeof feature.coordinates === 'string'
            ? JSON.parse(feature.coordinates)
            : feature.coordinates;

        if (!coords) {
            console.warn('[SmoothZoom] No coordinates');
            return;
        }

        const geomType = feature.geom_type || 'Point';

        switch (geomType) {
            case 'Point':
                if (coords.length >= 2) {
                    smoothZoomTo(map, [coords[1], coords[0]], defaultZoom);
                }
                break;

            case 'LineString':
            case 'Polyline':
                if (coords.length > 0) {
                    const bounds: L.LatLngExpression[] = coords
                        .filter((c: any) => c.length >= 2)
                        .map((c: any) => [c[1], c[0]]);

                    if (bounds.length > 0) {
                        map.fitBounds(L.latLngBounds(bounds), {
                            padding: [50, 50],
                            maxZoom: defaultZoom,
                            animate: true,
                            duration: 0.8,
                            easeLinearity: 0.15
                        });
                    }
                }
                break;

            case 'Polygon':
                if (coords[0] && coords[0].length > 0) {
                    const bounds: L.LatLngExpression[] = coords[0]
                        .filter((c: any) => c.length >= 2)
                        .map((c: any) => [c[1], c[0]]);

                    if (bounds.length > 0) {
                        map.fitBounds(L.latLngBounds(bounds), {
                            padding: [50, 50],
                            maxZoom: defaultZoom,
                            animate: true,
                            duration: 0.8,
                            easeLinearity: 0.15
                        });
                    }
                }
                break;

            default:
                console.warn(`[SmoothZoom] Unknown geometry type: ${geomType}`);
        }
    } catch (error) {
        console.error('[SmoothZoom] Error:', error);
    }
}

/**
 * Fit Bounds With Google Maps Style Animation
 * 
 * @param map - Leaflet map instance
 * @param bounds - Array of lat/lng coordinates
 * @param options - Fit bounds options
 */
export function smoothFitBounds(
    map: L.Map,
    bounds: L.LatLngExpression[],
    options?: L.FitBoundsOptions
) {
    map.fitBounds(L.latLngBounds(bounds), {
        padding: [50, 50],
        maxZoom: 18,
        animate: true,
        duration: 0.8,
        easeLinearity: 0.15,
        ...options
    });
}

/**
 * Fly To Location
 * Leaflet's flyTo with Google Maps-style duration
 *
 * @param map - Leaflet map instance
 * @param latlng - Target location [lat, lng]
 * @param zoom - Target zoom level
 * @param options - FlyTo options
 */
export function flyToLocation(
    map: L.Map,
    latlng: [number, number],
    zoom?: number,
    options?: {
        duration?: number;
        easeLinearity?: number;
        noMoveStart?: boolean;
    }
) {
    map.flyTo(latlng, zoom, {
        duration: 0.8,
        easeLinearity: 0.15,
        noMoveStart: true,
        ...options
    });
}
