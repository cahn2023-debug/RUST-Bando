# Polyline Visibility Fix - Comprehensive Solution

## Root Cause Analysis

From console logs, we can see:
```
[VectorLayer] ✅ Rendering polyline 8 with 152 points ▶ {color: '#3B82F6', weight: 2, isSelected: false}
```

The polylines ARE rendering, but with `weight: 2` instead of the 30px set in the UI. This indicates:

### Issue 1: Metadata Not Being Saved/Loaded
- User sets stroke to 30px in PropertyPanel
- Console shows weight: 2 (not 30)
- Metadata changes are not persisting to database or not loading back

### Issue 2: Potential Causes
1. **Normalization stripping size field** - `normalizeMetadataObject` might be removing the `size` field
2. **Event not applying correctly** - `queueEvent` might not be updating the store
3. **Database write failing** - SQLite write might be failing silently
4. **State not re-rendering** - React might not be detecting the state change

## Fix Plan

### Step 1: Enhanced Save Flow Debugging
Add detailed logging in `PropertyPanel.tsx` to track:
- Input value from UI
- Value after normalization
- Payload sent to queueEvent
- Confirmation of event application

### Step 2: Force Metadata Preservation
Ensure `size` field is preserved during normalization:
```typescript
// Before normalization, ensure size is a valid number
if (metaToSave.size !== undefined && metaToSave.size !== '') {
  metaToSave.size = Number(metaToSave.size);
}
```

### Step 3: VectorLayer Metadata Validation
Add validation in `VectorLayer.tsx` to check if metadata is being read correctly:
```typescript
console.log('[VectorLayer] Metadata check:', {
  'metadata.size': metadata.size,
  'metadata.weight': metadata.weight,
  'metadata.stroke': metadata.stroke,
  finalWeight: weight
});
```

### Step 4: Force Re-render on Metadata Change
Ensure the map re-renders when metadata changes:
- Trigger state update after save
- Force component re-render if needed

## Implementation

### Files to Modify:
1. `PropertyPanel.tsx` - Enhanced save logging and validation
2. `VectorLayer.tsx` - Metadata validation and logging
3. `metadataNormalization.ts` - Ensure size field preservation

## Testing Steps

1. Set stroke to 30px in PropertyPanel
2. Click "SAVE SPECS"
3. Check console for:
   - `[PropertyPanel] 🔧 Size/Stroke value: 30`
   - `[PropertyPanel] 📦 Payload: { size: 30, ... }`
   - `[VectorLayer] Metadata check: { metadata.size: 30, finalWeight: 30 }`
4. Verify polyline is visible with 30px width

## Expected Console Output (After Fix)

```
[PropertyPanel] 💾 Saving feature: <id>
[PropertyPanel] 📝 localMeta before save: { size: 30, color: "#ffa500" }
[PropertyPanel] 🔧 Size/Stroke value: 30
[PropertyPanel] ✅ Size converted to number: 30
[PropertyPanel] ✅ Standardized metadata: { size: 30, color: "#ffa500", ... }
[PropertyPanel] 📦 Final payload: { id: "...", name: "...", metadata.size: 30 }
[PropertyPanel] ✅ Event queued successfully
[PropertyPanel] 🔄 Map should re-render with new metadata
[VectorLayer] 🔍 Metadata check: { metadata.size: 30, finalWeight: 30 }
[VectorLayer] ✅ Rendering polyline 8 with 152 points ▶ { weight: 30 }
```

## Alternative: Direct Database Check

If metadata still not saving, check SQLite database directly:
```sql
SELECT event_id, event_type, payload_json 
FROM design_events 
WHERE event_type = 'FeatureUpdated' 
AND payload_json LIKE '%"size"%'
ORDER BY timestamp DESC 
LIMIT 5;
```

This will show if the size value is being written to the database.
