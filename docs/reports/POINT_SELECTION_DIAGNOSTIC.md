# Point Selection Diagnostic Report

## Issue
Point markers on the map are not responding to click events for selection.

## Investigation Findings

### 1. Code Flow Analysis ✅
The click handler IS properly registered on each marker:
```typescript
marker.on('click', (e: any) => {
    handleFeatureSelection(f.id, f.group_id, originalEvent);
});
```

### 2. Potential Blocking Issues

#### A. Marker Interactive Mode
```typescript
marker = L.marker([...], {
    icon,
    interactive: !isClickThrough,  // ← MUST be true
    pane: targetPane
});
```

**Check**: `isClickThrough = drawingMode !== 'none' && drawingMode !== 'move'`
- If `drawingMode` is NOT 'none' or 'move', marker is NOT interactive
- **Solution**: Ensure drawingMode is 'none' when trying to select points

#### B. Pane Z-Index
Markers are rendered in two panes:
- `markerPane` (default) - for normal rendering
- `move-tool-pane` (z-index: 1000) - for selected/movable markers

**Check**: If pane doesn't exist or has wrong z-index, markers might be behind other layers

#### C. CSS Pointer Events
```css
.custom-map-marker {
    pointer-events: auto !important;  /* MUST be auto */
}
```

**Check**: CSS might be overriding to `pointer-events: none`

#### D. MarkerClusterGroup Interference
- `disableClusteringAtZoom: 19` - markers only become clickable individually at zoom 19+
- At lower zoom levels, markers inside clusters might not receive clicks
- **Solution**: Zoom in to 19+ or spiderfy the cluster first

### 3. Event Propagation Chain

```
User clicks marker
    ↓
marker.on('click') fires
    ↓
stopFeatureEventPropagation(e) ← Should prevent map background click
    ↓
handleFeatureSelection(id, groupId, event)
    ↓
store.selectFeature(id) + store.zoomTo(id, 'feature')
```

### 4. DrawingExplorer Auto-Expand

DrawingExplorer has auto-expand logic (lines 330-386) that SHOULD trigger when `selectedFeatureId` changes:
```typescript
useEffect(() => {
    if (selectedFeatureId) {
        // Expand feature's group and parent chain
        const expandChain: Record<string, boolean> = {};
        // ... build expand chain ...
        setExpanded(prev => { ... });
    }
}, [selectedFeatureId, ...]);
```

## Root Cause Hypotheses

### Hypothesis 1: Drawing Mode is Wrong
**Symptom**: Markers don't respond to clicks at all
**Check**: `console.log(useDesignSync.getState().drawingMode)`
**Fix**: Switch to selection mode (not drawing mode)

### Hypothesis 2: MarkerClusterGroup Blocking
**Symptom**: Markers only work at zoom 19+
**Check**: Zoom to 19+ and try clicking markers
**Fix**: Either:
- Increase `disableClusteringAtZoom` to a lower value (e.g., 15)
- Or always zoom to 19 when selecting points

### Hypothesis 3: Pane Z-Index Issue
**Symptom**: Markers are rendered but clicks go through to map
**Check**: Inspect element to see which pane contains the marker
**Fix**: Ensure `markerPane` has appropriate z-index

### Hypothesis 4: Store State Not Syncing
**Symptom**: Click works but DrawingExplorer doesn't update
**Check**: Check if `selectedFeatureId` actually changes in store
**Fix**: Verify store subscription in DrawingExplorer

## Recommended Debug Steps

1. **Open browser console**
2. **Ensure drawingMode is 'none'** (not in draw mode)
3. **Zoom to level 19+**
4. **Click a Point marker**
5. **Check console for any errors**
6. **Check store state**: `useDesignSync.getState().selectedFeatureId`
7. **Check if marker element has**: `pointer-events: auto`

## Quick Fix Test

Add this temporary test to verify the selection mechanism works:

```typescript
// In browser console:
const store = useDesignSync.getState();
const firstPointId = Object.keys(store.state.features).find(
    id => store.state.features[id].geom_type === 'Point'
);
if (firstPointId) {
    store.selectFeature(firstPointId);
    store.zoomTo(firstPointId, 'feature');
    console.log('Selected:', firstPointId);
}
```

If this works → the store mechanism is fine, issue is in click handling
If this doesn't work → store state or subscription issue

## Next Steps

1. Run the app and test the above debug steps
2. Report which hypothesis matches the observed behavior
3. Apply targeted fix based on findings
