# Polyline Visibility Issue - Debug Report

## Problem Statement
Polylines are not displaying on the map even though:
1. They exist in the database (visible in left panel)
2. Console shows they ARE being rendered: `[VectorLayer] ✅ Rendering polyline 8 with 152 points`
3. User sets stroke to 30px, but console shows `weight: 2`
4. Metadata changes are not being saved/synchronized properly

## Root Causes Identified

### 1. **Metadata Not Saving** (Primary Issue)
- User sets stroke=30 in PropertyPanel
- Console shows `weight: 2` when rendering
- Indicates metadata is either:
  - Not being saved to database
  - Not being loaded from database
  - Lost during normalization

### 2. **Zoom-Level Filtering** (Potential Issue)
- `expansionZoom` logic may hide polylines at certain zoom levels
- Affects features with `depth == 0` incorrectly

### 3. **Rendering Layer Z-Index** (Secondary Issue)
- Polylines might be rendered behind other layers
- Canvas vs SVG rendering mode issues

## Data Flow Analysis

### Expected Flow:
```
User Input (Stroke: 30)
    ↓
PropertyPanel.localMeta.size = 30
    ↓
handleSave() → normalizeMetadataObject()
    ↓
queueEvent({ type: 'FeatureUpdated', payload: { metadata: JSON.stringify({...size: 30...}) } })
    ↓
useDesignSync Store Update
    ↓
Map Re-render
    ↓
VectorLayer reads metadata.size = 30
    ↓
Polyline renders with weight: 30
```

### Actual Flow (Broken):
```
User Input (Stroke: 30)
    ↓
PropertyPanel.localMeta.size = 30
    ↓
handleSave() → normalizeMetadataObject() → size lost?
    ↓
queueEvent() → metadata saved without size?
    ↓
useDesignSync Store → size not present
    ↓
Map Re-render
    ↓
VectorLayer reads metadata.size = undefined
    ↓
Polyline renders with weight: 2 (default)
```

## Files to Check

### 1. PropertyPanel.tsx
- Verify `localMeta` contains `size` field
- Check `updateNestedMeta('size', value)` is working
- Verify `handleSave` sends correct payload

### 2. metadataNormalization.ts
- Check if `size` is being preserved during normalization
- Verify it's not being pruned as empty

### 3. VectorLayer.tsx
- Already added logging to show metadata values
- Confirms what value is actually received

### 4. DesignFeatures.tsx
- Check zoom filtering logic for polylines
- Ensure polylines aren't filtered out

## Diagnostic Steps

### Step 1: Check Console Logs
Look for these specific logs:
```
[PropertyPanel] 🔧 Size/Stroke value: <should be 30>
[PropertyPanel] 📦 Payload being sent: { metadata: "{\"size\":30,...}" }
[VectorLayer] 🔍 Metadata check: { metadata.size: <should be 30> }
```

### Step 2: Run Diagnostic Tool
```javascript
window.runPolylineDiagnostic()
```

This will show:
- All polyline features in state
- Their coordinates (valid/invalid)
- Their metadata (including size value)
- Whether they're hidden by visibility settings

### Step 3: Check Database Directly
If metadata is not saving, check SQLite database:
```sql
SELECT event_id, payload_json 
FROM design_events 
WHERE event_type = 'FeatureUpdated' 
AND payload_json LIKE '%"size"%'
ORDER BY timestamp DESC 
LIMIT 10;
```

## Solutions to Implement

### Fix 1: Ensure Metadata Saves Correctly
- Add validation in `handleSave` to verify `size` is in payload
- Check `normalizeMetadataObject` doesn't prune `size` field
- Add rollback if save fails

### Fix 2: Fix Zoom Filtering for Polylines
- Only apply `expansionZoom` logic to POINT features
- Polylines/Polygons should always render if in bounds

### Fix 3: Force Re-render on Metadata Change
- Ensure state update triggers map re-render
- Check React memoization isn't preventing updates

## Next Steps

1. ✅ Run diagnostic tool and share output
2. ✅ Check console for specific log messages
3. ⏳ Verify metadata normalization preserves `size`
4. ⏳ Fix zoom filtering to not hide polylines
5. ⏳ Test with simplified polyline (2-3 points)

## Console Log Examples to Look For

### ✅ Good (Metadata Saved):
```
[PropertyPanel] 🔧 Size/Stroke value: 30
[PropertyPanel] 📦 Payload: {"size":30,"color":"#ffa500"}
[VectorLayer] 🔍 Metadata check: { metadata.size: 30 }
[VectorLayer] ✅ Rendering polyline 8 with 152 points ▶ {weight: 30}
```

### ❌ Bad (Metadata Lost):
```
[PropertyPanel] 🔧 Size/Stroke value: undefined  ← Problem!
[PropertyPanel] 📦 Payload: {"color":"#ffa500"}  ← No size!
[VectorLayer] 🔍 Metadata check: { metadata.size: undefined }
[VectorLayer] ✅ Rendering polyline 8 with 152 points ▶ {weight: 2}
```

### ❌ Bad (Metadata Not Received):
```
[PropertyPanel] 🔧 Size/Stroke value: 30
[PropertyPanel] 📦 Payload: {"size":30,"color":"#ffa500"}
[VectorLayer] 🔍 Metadata check: { metadata.size: undefined } ← Lost in transit!
```
