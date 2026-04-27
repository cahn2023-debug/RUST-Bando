# Debug Log: Polyline Drag-and-Drop Editing Issues

## 🧐 Problem Analysis
User reported that polyline drag-and-drop editing is not working.

### Root Causes Identified:
1.  **State Reset**: `useDesignSync.selectFeature` explicitly sets `editingFeatureId: null`. This prevents the `VertexEditor` handles from ever appearing on click/selection.
2.  **Marker Positioning Bug**: In `VertexEditor.tsx`, the `displayPosition` for the dragged marker was pinned to the *original* coordinates (`coords[i]`) instead of the *optimistic* preview coordinates (`c`). This makes the handle seem stuck while the line moves, or causes jitter.
3.  **Missing Activation**: `VectorLayer.tsx` clicks only select, but don't explicitly transition into a state where handles are visible (if `selectFeature` clears `editingFeatureId`).

## 🛠️ Proposed Fixes:
1.  **Modify `useDesignSync.ts`**: Update `selectFeature` to set `editingFeatureId = id` for non-point features (LineString/Polygon).
2.  **Fix `VertexEditor.tsx`**: 
    - Remove the ternary check in `displayPosition`.
    - Ensure `L.DivIcon` styles are robust.
3.  **Visual Polish**: Ensure the pulse animation is defined in CSS (it was missing from `index.css` probably).

##  COUNCIL FEEDBACK (Virtual Council /tv)
- **Architect**: Selection should trigger Vertex Handles for Polylines/Polygons to match Google Maps UI.
- **Logic**: The `displayPosition` ternary is a regression from previous refactoring. Replace with direct `c` usage.
- **UI**: Added the pulse animation to `index.css`.
