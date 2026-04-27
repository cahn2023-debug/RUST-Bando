# Polyline Visibility Issue - Comprehensive Analysis

## Problem Summary
Polylines are not visible on the map, but console shows they ARE being rendered with valid coordinates (81-152 points). The weight is showing as 2 instead of the 30px set in the UI, indicating metadata is not being saved/loaded correctly.

## Root Cause Analysis

### Issue 1: Metadata Not Persisting
From console logs:
```
[VectorLayer] ✅ Rendering polyline 8 with 152 points ▶ {color: '#3B82F6', weight: 2, isSelected: false}
```

The polyline IS rendering, but with `weight: 2` instead of 30. This means:
- Coordinates are valid ✅
- Feature is being passed to VectorLayer ✅
- Metadata (size/stroke) is NOT being saved or loaded ❌

### Potential Causes

#### A. PropertyPanel Save Flow
1. User sets stroke to 30 in UI
2. `updateNestedMeta('size', 30)` updates `localMeta`
3. User clicks "SAVE SPECS"
4. `handleSave()` calls `normalizeMetadataObject(localMeta)`
5. Event is queued via `queueEvent`
6. **BUT**: Metadata might be lost during normalization or not saved to DB

#### B. Metadata Normalization
In `metadataNormalization.ts`:
- `size` is in `NUMBER_KEYS` set
- Should be normalized to a number
- BUT might be pruned if it's 0 or empty

#### C. State Synchronization
- Event might be queued but not applied to state
- State update might not trigger re-render
- VectorLayer might be reading stale metadata

## Fix Plan

### Step 1: Enhanced Logging
Add comprehensive logging to track:
- Value in PropertyPanel before save
- Value after normalization
- Value in event payload
- Value in VectorLayer when rendering
- Value in database (if accessible)

### Step 2: Force Metadata Preservation
Ensure `size` field is never lost:
```typescript
// In handleSave
const metaToSave = { ...localMeta };
if (metaToSave.size !== undefined && metaToSave.size !== '') {
  metaToSave.size = Number(metaToSave.size);
  console.log('✅ Size preserved:', metaToSave.size);
}
```

### Step 3: Force Re-render
Ensure state update triggers re-render after save:
```typescript
// After queueEvent
await queueEvent({ ... });
// Force state update to trigger re-render
useDesignSync.getState().setPreview(null, null);
```

### Step 4: Verify Database
Check if metadata is actually being saved:
```sql
-- Check recent FeatureUpdated events
SELECT event_id, payload_json 
FROM design_events 
WHERE event_type = 'FeatureUpdated' 
AND payload_json LIKE '%"size"%'
ORDER BY timestamp DESC LIMIT 10;
```

## Files to Modify

1. **PropertyPanel.tsx**
   - Add validation that size is preserved after normalization
   - Force re-render after save
   - Add error logging if size is lost

2. **VectorLayer.tsx**
   - Add logging to show what metadata is being read
   - Verify size/stroke values are present

3. **metadataNormalization.ts**
   - Ensure size field is never pruned
   - Add validation for number fields

4. **designActionSlice.ts** (if needed)
   - Verify events are being applied correctly
   - Ensure state updates trigger re-renders

## Expected Console Output After Fix

```
[PropertyPanel] 💾 Saving feature: <id>
[PropertyPanel] 📝 localMeta: { size: 30, color: "#ffa500" }
[PropertyPanel] 🔧 Size value: 30
[PropertyPanel] ✅ Size converted to number: 30
[PropertyPanel] 📦 Standardized metadata: { size: 30, color: "#ffa500", ... }
[PropertyPanel] 📦 Payload: { id: "...", name: "...", metadata: {"size":30,...} }
[PropertyPanel] ✅ Event queued successfully
[VectorLayer] 🔍 Metadata for polyline 8: { size: 30, weight: 30 }
[VectorLayer] ✅ Rendering polyline 8 with 152 points ▶ {weight: 30}
```

## Testing Steps

1. Open console (F12)
2. Select a polyline feature
3. Set stroke to 30px in PropertyPanel
4. Click "SAVE SPECS"
5. Check console logs for size value throughout the flow
6. Verify polyline is visible with correct weight
7. Reload page and verify metadata persists

## Debugging Commands

Run in browser console:
```javascript
// Check if polyline features exist
const state = window.__DESIGN_SYNC__?.getState()?.state;
const lines = Object.values(state?.features || {}).filter(f => 
  f.geom_type?.toLowerCase().includes('line') || 
  f.geom_type?.toLowerCase().includes('poly')
);
console.log('Line features:', lines.length);

// Check metadata of first polyline
if (lines.length > 0) {
  const first = lines[0];
  const meta = typeof first.metadata === 'string' ? JSON.parse(first.metadata) : first.metadata;
  console.log('First polyline metadata:', meta);
  console.log('Size value:', meta.size);
}

// Run full diagnostic
window.runPolylineDiagnostic();
```

## Immediate Action Required

The most likely issue is that **metadata is being lost during the save/load cycle**. The fix should:

1. ✅ Add validation in PropertyPanel to ensure size is preserved
2. ✅ Add comprehensive logging to track where value is lost
3. ✅ Force re-render after save to ensure map updates
4. ✅ Verify database write is successful

Let's implement these fixes now.
