/**
 * Map Zoom Controller
 * Centralized zoom functionality for all map feature types
 * Ensures consistent zoom behavior:
 * - Points: Center map at zoom level 18
 * - Polylines/Polygons: Fit bounds with padding at max zoom 18
 */

import L from 'leaflet';
import { isValidLatLng } from '@DESIGN/features/map/MapLayerComponents/ZoomExtendControl';

/**
 * Zooms the map to a specific feature based on its geometry type
 * 
 * @param map - The Leaflet map instance
 * @param coordinates - The feature coordinates (parsed)
 * @param geomType - The geometry type (Point, LineString, Polygon)
 */
export function zoomToFeature(
    map: L.Map,
    coordinates: any,
    geomType: string = 'Point'
) {
    try {
        const coords = typeof coordinates === 'string' 
            ? JSON.parse(coordinates) 
            : coordinates;

        if (!coords) {
            console.warn('[ZoomController] No coordinates provided');
            return;
        }

        switch (geomType) {
            case 'Point':
                zoomToPoint(map, coords);
                break;
            case 'LineString':
            case 'Polyline':
                zoomToLine(map, coords);
                break;
            case 'Polygon':
                zoomToPolygon(map, coords);
                break;
            default:
                console.warn(`[ZoomController] Unknown geometry type: ${geomType}`);
        }
    } catch (error) {
        console.error('[ZoomController] Error zooming to feature:', error);
    }
}

/**
 * Zooms to a point feature - centers map at zoom level 18
 */
function zoomToPoint(map: L.Map, coords: number[]) {
    if (coords.length >= 2 && isValidLatLng(coords[1], coords[0])) {
        map.setView([coords[1], coords[0]], 18);
    }
}

/**
 * Zooms to a line feature - fits bounds with padding
 */
function zoomToLine(map: L.Map, coords: number[][]) {
    if (!coords || coords.length === 0) return;

    const bounds: L.LatLngExpression[] = [];
    coords.forEach((c: any) => {
        if (isValidLatLng(c[1], c[0])) {
            bounds.push([c[1], c[0]]);
        }
    });

    if (bounds.length > 0) {
        map.fitBounds(L.latLngBounds(bounds), { 
            padding: [50, 50], 
            maxZoom: 18 
        });
    }
}

/**
 * Zooms to a polygon feature - fits bounds with padding
 */
function zoomToPolygon(map: L.Map, coords: any[]) {
    if (!coords || !coords[0] || coords[0].length === 0) return;

    const bounds: L.LatLngExpression[] = [];
    coords[0].forEach((c: any) => {
        if (isValidLatLng(c[1], c[0])) {
            bounds.push([c[1], c[0]]);
        }
    });

    if (bounds.length > 0) {
        map.fitBounds(L.latLngBounds(bounds), { 
            padding: [50, 50], 
            maxZoom: 18 
        });
    }
}

/**
 * Creates a zoom trigger for the store to broadcast to all map instances
 * 
 * @param featureId - The feature ID to zoom to
 * @param type - The zoom type ('feature', 'layer', 'region', 'group', 'location')
 * @param location - Optional location coordinates for type='location'
 */
export function createZoomTrigger(
    featureId: string,
    type: 'feature' | 'layer' | 'region' | 'group' | 'location',
    location?: [number, number]
) {
    return {
        id: featureId,
        type,
        location,
        timestamp: Date.now()
    };
}
