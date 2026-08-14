# Map Selection System

## Overview
This module centralizes all map feature selection logic for Points, Polylines, and Polygons, ensuring consistent behavior across all feature types.

**NEW**: Now includes Google Maps-style event handling and smooth zoom animations!

## Location
`src/DESIGN/feature/map/`

## Features

### 1. Unified Click Handling
All feature types (Point, Polyline, Polygon) now use the same selection handler:
- **File**: `SelectionManager.ts`
- **Function**: `handleFeatureSelection(featureId, groupId, originalEvent)`

### 2. Google Maps-Style Event Handling
Automatic event propagation stopping like Google Maps `addListener`:
- **File**: `MapClickHandler.ts`
- **Functions**: 
  - `createGoogleMapsStyleHandler()` - Auto stopPropagation
  - `createEnhancedFeatureClickHandler()` - Complete click handler
  - `createBackgroundClickHandler()` - Smart background detection

### 3. Smooth Zoom Animations
Google Maps-style smooth zoom with proper easing:
- **File**: `SmoothZoomController.ts`
- **Functions**:
  - `smoothZoomTo()` - Smooth zoom with 800ms duration
  - `smoothPanTo()` - Smooth pan keeping zoom level
  - `smoothZoomToFeature()` - Auto-detect geometry type
  - `smoothFitBounds()` - Animated bounds fitting

### 4. Auto-Zoom Behavior
When a feature is selected from the map:
- **Points**: Center map at the point location with zoom level 18 (smooth animation!)
- **Polylines/Polygons**: Fit bounds to show the entire geometry with padding (max zoom 18)

### 5. DrawingExplorer Integration
When a feature is selected:
1. The feature is highlighted in the Project Explore panel
2. The panel automatically scrolls to bring the selected feature into view
3. The corresponding group is also highlighted

## Architecture

```
DESIGN/feature/map/
├── SelectionManager.ts    # Centralized selection logic
├── ZoomController.ts      # Zoom behavior for different geometry types
└── index.ts               # Public API exports
```

## Usage

### In Feature Click Handlers

```typescript
import { handleFeatureSelection, stopFeatureEventPropagation } from '@DESIGN/feature/map';

// In your feature click handler:
marker.on('click', (e: any) => {
    stopFeatureEventPropagation(e);
    handleFeatureSelection(featureId, groupId, e.originalEvent);
});
```

### Multi-Select Support
Hold **Shift** key while clicking to add features to the selection instead of replacing it.

## Implementation Details

### SelectionManager.ts
- `handleFeatureSelection()`: Main entry point for feature selection
- `stopFeatureEventPropagation()`: Prevents click from reaching map background
- `isFeatureElement()`: Helper to detect if a DOM element is a map feature

### ZoomController.ts
- `zoomToFeature()`: Routes to appropriate zoom behavior based on geometry type
- `zoomToPoint()`: Centers map at zoom level 18
- `zoomToLine()`: Fits bounds with padding
- `zoomToPolygon()`: Fits bounds with padding
- `createZoomTrigger()`: Creates trigger object for store broadcast

## Updated Files

The following files have been updated to use the centralized selection system:

1. **PointLayer.tsx** - Now uses `handleFeatureSelection` instead of inline logic
2. **VectorLayer.tsx** - Now uses `handleFeatureSelection` for both Polylines and Polygons

## Benefits

1. **Consistency**: All feature types behave identically when selected
2. **Maintainability**: Selection logic is in one place, easy to modify
3. **Extensibility**: Easy to add new feature types with the same behavior
4. **Debugging**: Single location to debug selection issues
5. **Code Organization**: Selection-related code is now in `DESIGN/feature/map/` folder

## Testing Checklist

- [ ] Click on Point → selects, zooms to center (level 18), highlights in DrawingExplorer
- [ ] Click on Polyline → selects, fits bounds, highlights in DrawingExplorer  
- [ ] Click on Polygon → selects, fits bounds, highlights in DrawingExplorer
- [ ] Shift+click → adds to selection (multi-select)
- [ ] Click same feature → toggles selection off
- [ ] Click background → deselects all features
- [ ] DrawingExplorer auto-scrolls to selected feature
- [ ] Build passes without errors

## Troubleshooting

### Issue: Clicking Point does nothing

**Step 1: Check Drawing Mode**
```javascript
// In browser console:
console.log(useDesignSync.getState().drawingMode);
// Should be 'none' or 'move'
```

**Step 2: Use Debug Utilities**
```javascript
// In browser console:
testFullSelectionFlow();  // Tests complete selection chain
testMarkerConfiguration(); // Checks if markers are interactive
```

**Step 3: Check Zoom Level**
- MarkerClusterGroup has `disableClusteringAtZoom: 19`
- Points might be inside clusters at lower zoom levels
- Zoom to 19+ and try clicking again

**Step 4: Manually Test Selection**
```javascript
// In browser console:
testPointSelection();  // Attempts to select first Point in state
```

### Common Causes

1. **In Drawing Mode**: Switch to selection mode (cursor icon, not draw tools)
2. **Clustered Markers**: Zoom in to 19+ to disable clustering
3. **Store Not Synced**: Reload project or check console for errors
4. **CSS Override**: Check if `pointer-events: none` is applied to markers

