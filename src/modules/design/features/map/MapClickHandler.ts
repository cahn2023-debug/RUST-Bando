/**
 * MapClickHandler - Google Maps Style Event Management
 * 
 * This module provides Google Maps-like click behavior for Leaflet maps:
 * - Automatic event propagation stopping (like Google Maps addListener)
 * - Clear separation between feature clicks and background clicks
 * - Smooth zoom animations with Google Maps-style easing
 * 
 * Usage:
 * ```typescript
 * import { createGoogleMapsStyleHandler } from '@DESIGN/feature/map/MapClickHandler';
 * 
 * // Google Maps style - auto stopPropagation
 * const handler = createGoogleMapsStyleHandler((featureId, event) => {
 *   selectFeature(featureId);
 *   zoomTo(featureId, 'feature');
 * });
 * 
 * marker.on('click', handler);
 * ```
 */

import L from 'leaflet';

/**
 * Google Maps Style Handler
 * Automatically stops event propagation like Google Maps addListener
 */
export function createGoogleMapsStyleHandler(
    handler: (featureId: string, event: any, originalEvent?: MouseEvent) => void
) {
    return (e: any) => {
        // Auto stop propagation like Google Maps
        if (e && typeof e === 'object') {
            // Stop Leaflet propagation
            if (typeof L.DomEvent.stopPropagation === 'function') {
                L.DomEvent.stopPropagation(e);
            }

            // Stop DOM propagation
            const originalEvent = e.originalEvent || e;
            if (originalEvent && typeof originalEvent.stopPropagation === 'function') {
                originalEvent.stopPropagation();
            }
        }

        // Call user handler
        const featureId = (e.target as any)?.options?.featureId || (e.target as any)?.featureId;
        const originalEvent = e.originalEvent || e;

        if (featureId) {
            handler(featureId, e, originalEvent);
        }
    };
}

/**
 * Feature Event Detector
 * Detects if a click target is a map feature element
 */
export function isFeatureElement(target: EventTarget | null): boolean {
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

/**
 * Enhanced Feature Click Handler
 * Combines Google Maps-style event handling with project's selection logic
 */
export function createEnhancedFeatureClickHandler(options: {
    featureId: string;
    groupId: string;
    onSelection?: (featureId: string, keepSelection: boolean) => void;
    onZoom?: (featureId: string) => void;
    onSelectedGroup?: (groupId: string) => void;
}) {
    return (e: any) => {
        // Google Maps style: auto stop propagation
        if (e && typeof e === 'object') {
            L.DomEvent.stopPropagation(e);
            const originalEvent = e.originalEvent || e;
            if (originalEvent?.stopPropagation) {
                originalEvent.stopPropagation();
            }
        }

        // Detect shift key for multi-select
        const originalEvent = e.originalEvent || e;
        const keepSelection = !!originalEvent?.shiftKey;

        // Call selection handler
        options.onSelection?.(options.featureId, keepSelection);

        // Set selected group
        options.onSelectedGroup?.(options.groupId);

        // Trigger zoom (only for single select)
        if (!keepSelection) {
            options.onZoom?.(options.featureId);
        }
    };
}

/**
 * Background Click Detector
 * Detects clicks on map background (not on features)
 * Used for deselection
 */
export function createBackgroundClickHandler(options: {
    onDeselect?: () => void;
    ignoreWhenDrawing?: boolean;
    getDrawingMode?: () => string;
}) {
    return (e: L.LeafletMouseEvent) => {
        const target = e.originalEvent?.target as HTMLElement;

        // Don't deselect if clicked on feature
        if (isFeatureElement(target)) {
            return;
        }

        // Don't deselect if in drawing mode
        if (options.ignoreWhenDrawing && options.getDrawingMode) {
            const mode = options.getDrawingMode();
            if (mode !== 'none' && mode !== 'move') {
                return;
            }
        }

        // Call deselect handler
        options.onDeselect?.();
    };
}
