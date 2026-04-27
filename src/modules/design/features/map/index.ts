/**
 * Map Feature Selection Module
 * 
 * Centralized selection and zoom logic for all map feature types.
 * This module ensures consistent behavior across Points, Polylines, and Polygons:
 * 
 * Features:
 * - Unified click handling for all feature types
 * - Auto-zoom to selected feature (Points: center zoom 18, Lines/Polygons: fit bounds)
 * - Automatic DrawingExplorer update with scroll-to-selected
 * - Multi-select support via Shift+click
 * - Google Maps-style event handling and smooth animations
 * 
 * Usage:
 * ```typescript
 * import { 
 *   handleFeatureSelection, 
 *   createGoogleMapsStyleHandler,
 *   smoothZoomToFeature
 * } from '@DESIGN/feature/map';
 * 
 * // Google Maps style click handler
 * const handler = createGoogleMapsStyleHandler((featureId, event) => {
 *   selectFeature(featureId);
 *   smoothZoomToFeature(map, feature, 18);
 * });
 * 
 * marker.on('click', handler);
 * ```
 */

// Core Selection
export { handleFeatureSelection, stopFeatureEventPropagation, isFeatureElement } from './SelectionManager';
export { zoomToFeature, createZoomTrigger } from './ZoomController';

// Google Maps Style Event Handling
export {
    createGoogleMapsStyleHandler,
    createEnhancedFeatureClickHandler,
    createBackgroundClickHandler,
    isFeatureElement as isFeatureElementFromEvent
} from './MapClickHandler';

// Smooth Zoom Animations (Google Maps Style)
export {
    smoothZoomTo,
    smoothPanTo,
    smoothZoomToFeature,
    smoothFitBounds,
    flyToLocation,
    googleMapsEasing
} from './SmoothZoomController';

// Debug utilities (development only)
export { testPointSelection, testMarkerConfiguration, testDrawingExplorerExpand, testFullSelectionFlow } from './PointSelectionDebug';
