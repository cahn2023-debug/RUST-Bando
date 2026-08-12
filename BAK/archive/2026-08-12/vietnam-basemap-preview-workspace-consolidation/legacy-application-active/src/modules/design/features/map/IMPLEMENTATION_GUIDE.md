# Map Selection Feature - Implementation Guide

## ✅ Completed Features

### 1. Click Point on Map → Zoom & Highlight in DrawingExplorer

**Status**: ✅ WORKING

When you click on a **Point** feature on the map:
1. ✅ Point gets selected (cyan glow highlight)
2. ✅ Map centers on the Point at zoom level 18
3. ✅ DrawingExplorer auto-expands the tree hierarchy
4. ✅ DrawingExplorer scrolls to show the selected Point
5. ✅ Point is highlighted in DrawingExplorer tree

### 2. Click Polyline/Polygon on Map → Fit Bounds & Highlight

**Status**: ✅ WORKING

When you click on a **Polyline** or **Polygon** feature:
1. ✅ Feature gets selected (cyan highlight with dashed line)
2. ✅ Map fits bounds to show entire feature (max zoom 18)
3. ✅ DrawingExplorer auto-expands and scrolls to feature
4. ✅ Vertex editor activates for editing

## 🔍 How It Works

### Flow Diagram

```
User clicks Point on map
    ↓
PointLayer.tsx: marker.on('click')
    ↓
SelectionManager.ts: handleFeatureSelection()
    ↓
┌─────────────────────────────────────┐
│ 1. store.selectFeature(featureId)   │ → Sets selectedFeatureId
│ 2. store.setSelectedGroup(groupId)  │ → Highlights group in tree
│ 3. store.zoomTo(featureId, 'feature') │ → Triggers zoom
└─────────────────────────────────────┘
    ↓
┌──────────────────────────────────────┐
│ Parallel Reactions:                  │
│                                      │
│ A) ZoomToHandler.tsx:                │
│    map.setView([lat, lng], 18)       │
│                                      │
│ B) DrawingExplorer.tsx:              │
│    - Auto-expand parent groups       │
│    - Scroll to selected feature      │
│    - Highlight feature in tree       │
└──────────────────────────────────────┘
```

### Key Code Locations

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| SelectionManager | `DESIGN/feature/map/SelectionManager.ts` | 25-53 | Centralized selection logic |
| Point Click Handler | `DESIGN/features/map/MapLayerComponents/PointLayer.tsx` | 283-294 | Marker click → selection |
| Polyline Click Handler | `DESIGN/features/map/MapLayerComponents/VectorLayer.tsx` | 54-66 | Hit area click → selection |
| Zoom Handler | `DESIGN/features/map/MapLayerComponents/ZoomToHandler.tsx` | 17-45 | Performs actual zoom |
| DrawingExplorer Auto-expand | `DESIGN/components/core/CADPanels/DrawingExplorer.tsx` | 330-386 | Expands tree hierarchy |
| DrawingExplorer Auto-scroll | `DESIGN/components/core/CADPanels/DrawingExplorer.tsx` | 884-908 | Scrolls to selected item |
| Store selectFeature | `IMPLEMENT/stores/useDesignSync.ts` | 504-555 | Updates selection state |
| Store zoomTo | `IMPLEMENT/stores/useDesignSync.ts` | 485-490 | Broadcasts zoom trigger |

## 🧪 Testing Guide

### Test 1: Point Selection from Map

**Steps**:
1. Open application
2. Navigate to map view
3. Click on any **Point** marker (camera, intersection node, etc.)

**Expected Results**:
- ✅ Marker gets cyan glow highlight
- ✅ Map smoothly zooms to center the marker at level 18
- ✅ DrawingExplorer panel expands the group hierarchy
- ✅ DrawingExplorer scrolls to show the selected point
- ✅ Point is highlighted in the tree view
- ✅ Popup appears with feature details

**Debug Output** (check browser console):
```
[SelectionManager] Selecting feature: <featureId>, keepSelection: false
[Store] selectFeature called for ID: <featureId>, keepSelection: false
[Store] Feature found. geomType: Point, isVector: false
```

### Test 2: Polyline Selection from Map

**Steps**:
1. Click on any **Polyline** (route, boundary line, etc.)

**Expected Results**:
- ✅ Line turns cyan with dashed style
- ✅ Map fits bounds to show entire line (max zoom 18)
- ✅ DrawingExplorer expands and scrolls to feature
- ✅ Vertex handles appear for editing

### Test 3: Multi-Select (Shift+Click)

**Steps**:
1. Click on a Point (single select → zooms)
2. Hold **Shift** key and click another Point

**Expected Results**:
- ✅ Both points remain selected
- ✅ Map does NOT zoom (preserves view)
- ✅ Both features highlighted in DrawingExplorer

### Test 4: Deselect (Click Background)

**Steps**:
1. Select a feature
2. Click on empty map area (not on any feature)

**Expected Results**:
- ✅ All selections cleared
- ✅ Map view stays the same (no zoom)
- ✅ DrawingExplorer returns to normal view

### Test 5: Toggle Selection (Click Same Feature)

**Steps**:
1. Select a feature
2. Click the same feature again

**Expected Results**:
- ✅ Feature deselected
- ✅ Selection cleared

## 🐛 Troubleshooting

### Issue: Click Point but nothing happens

**Check**:
1. Open browser console - look for `[SelectionManager]` logs
2. Verify `drawingMode` is `'none'` or `'move'` (not in drawing mode)
3. Check if Point has valid `geom_type` = 'Point'
4. Verify coordinates are valid [lng, lat] format

**Common causes**:
- In drawing mode (switch to selection mode)
- Point has invalid coordinates
- Store state not synced

### Issue: Zooms but DrawingExplorer doesn't scroll

**Check**:
1. Console for errors in DrawingExplorer.tsx
2. Verify `flattenedItems` array contains the feature
3. Check if `virtuosoRef.current` exists

**Common causes**:
- Tree not expanded yet (150ms delay is intentional)
- Feature filtered out or hidden
- Virtuoso virtualization issue

### Issue: DrawingExplorer scrolls but map doesn't zoom

**Check**:
1. Console for `zoomToTrigger` updates
2. Verify `ZoomToHandler.tsx` is mounted
3. Check if coordinates pass `isValidLatLng()` validation

**Common causes**:
- Invalid coordinate format
- ZoomToHandler not rendered in map
- Coordinate parsing fails

## 📝 Code Organization

All selection-related code is now centralized in:

```
src/DESIGN/feature/map/
├── SelectionManager.ts    # handleFeatureSelection(), stopEventPropagation()
├── ZoomController.ts      # zoomToFeature() utilities
├── index.ts               # Public API exports
└── README.md              # Documentation
```

### Benefits of This Structure

1. **Single Source of Truth**: All selection logic in one place
2. **Easy to Debug**: Console logs clearly trace the flow
3. **Consistent Behavior**: Points, Lines, Polygons all work the same
4. **Easy to Extend**: Add new feature types with same behavior
5. **Well Documented**: README explains usage patterns

## 🎯 Next Steps (Optional Enhancements)

- [ ] Add keyboard navigation (arrow keys to cycle features)
- [ ] Add selection box for multiple features
- [ ] Add "select all in view" option
- [ ] Add selection history (back/forward)
- [ ] Add cross-window sync for multi-monitor setups
