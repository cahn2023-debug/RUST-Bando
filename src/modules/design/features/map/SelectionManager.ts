/**
 * Map Selection Manager
 * Centralized selection logic for all map feature types (Point, Polyline, Polygon)
 * Ensures consistent behavior across all feature types:
 * - Click to select
 * - Zoom to center with level 18
 * - Update DrawingExplorer to highlight and scroll to selected feature
 */

import L from 'leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';

/**
 * Handles feature selection from map click events
 * This is the unified selection handler for ALL feature types
 * 
 * When a user clicks on a feature on the map:
 * 1. The feature is selected (highlighted on map)
 * 2. Map zooms to center the feature (Points: zoom level 18)
 * 3. DrawingExplorer auto-expands and scrolls to show the feature
 * 
 * @param featureId - The ID of the feature to select
 * @param groupId - The group ID of the feature
 * @param originalEvent - The original click event (for detecting shiftKey)
 */
export function handleFeatureSelection(
    featureId: string,
    groupId: string,
    originalEvent?: any
) {
    const store = useDesignSync.getState();

    // Only allow selection in 'none' or 'move' drawing modes
    if (store.drawingMode !== 'none' && store.drawingMode !== 'move') {
        console.log(`[Selection] Blocked - drawingMode is '${store.drawingMode}' (must be 'none' or 'move')`);
        return;
    }

    console.log(`[Selection] Selecting feature: ${featureId}, group: ${groupId}`);

    // Detect shift key for multi-select
    const keepSelection = !!originalEvent?.shiftKey;

    // Capture click location for popups (especially for Lines/Polygons)
    let clickLocation: [number, number] | undefined = undefined;
    if (originalEvent && 'latlng' in originalEvent) {
        const ev = originalEvent as any;
        clickLocation = [ev.latlng.lat, ev.latlng.lng];
    }

    // Select the feature - this triggers DrawingExplorer auto-expand & scroll
    store.selectFeature(featureId, keepSelection, clickLocation);
    store.setSelectedGroup(groupId);

    // Record marker click time to prevent BoxSelectionHandler from deselecting immediately
    (store as any)._lastMarkerClickTime = Date.now();

    console.log(`[Selection] Feature ${featureId} selected, keepSelection: ${keepSelection}`);

    // Auto-zoom on single select (not multi-select)
    // This triggers ZoomToHandler which centers the map:
    // - Points: map.setView([lat, lng], 20)
    // - Lines/Polygons: map.fitBounds(bounds, { maxZoom: 20 })
    if (!keepSelection) {
        console.log(`[Selection] Triggering zoom to feature ${featureId}`);
        store.zoomTo(featureId, 'feature');
    }
}

/**
 * Stops event propagation to prevent map background from receiving the click
 * Use this in feature click handlers
 * 
 * @param event - The Leaflet or DOM event to stop
 */
export function stopFeatureEventPropagation(event: any) {
    // Stop Leaflet event propagation
    if (event && typeof event === 'object') {
        L.DomEvent.stopPropagation(event);

        // Also stop the original DOM event if it exists
        const originalEvent = event.originalEvent || event;
        if (originalEvent && typeof originalEvent.stopPropagation === 'function') {
            originalEvent.stopPropagation();
        }
    }
}

/**
 * Checks if a DOM element is a map feature element
 * Used to distinguish feature clicks from background clicks
 * 
 * @param target - The DOM element to check
 * @returns true if the element is a feature
 */
export function isFeatureElement(target: HTMLElement | EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) {
        return false;
    }

    const element = target as HTMLElement;

    return (
        element.tagName === 'path' ||
        element.tagName === 'IMG' ||
        element.classList.contains('leaflet-interactive') ||
        element.classList.contains('custom-map-marker') ||
        element.classList.contains('selected-marker') ||
        !!element.closest('.leaflet-marker-icon') ||
        !!element.closest('.leaflet-interactive') ||
        !!element.closest('.custom-map-marker') ||
        !!element.closest('.selected-marker')
    );
}
