# Polyline Visibility Issue - Root Cause Analysis

## Problem Summary
- **Symptom**: Polylines not visible on map
- **Console shows**: Polylines ARE rendering with valid coordinates (81-152 points)
- **Key issue**: Weight showing as 2 instead of set value (28-30px)
- **Root cause**: Metadata is not being saved or synchronized correctly

## Evidence from Console Logs

```
[VectorLayer] ✅ Rendering polyline 8 with 152 points ▶ {color: '#3B82F6', weight: 2, isSelected: false}
```

This tells us:
1. ✅ Coordinates are valid (152 points)
2. ✅ Feature is being passed to VectorLayer
3. ✅ Color is correct ('#3B82F6')
4. ❌ Weight is wrong (2 instead of 28-30)

## Data Flow Analysis

### Expected Flow (When Working):
```
User sets stroke to 30px in PropertyPanel
    ↓
updateNestedMeta('size', 30)
    ↓
localMeta.size = 30
    ↓
User clicks "SAVE SPECS"
    ↓
handleSave() → normalizeMetadataObject(localMeta)
    ↓
standardizedMeta.size = 30
    ↓
queueEvent({ metadata: JSON.stringify(standardizedMeta) })
    ↓
FeatureUpdated event applied to state
    ↓
state.features[id].metadata = { size: 30, ... }
    ↓
Map re-renders
    ↓
VectorLayer reads metadata.size = 30
    ↓
Polyline renders with weight: 30
```

### Actual Flow (Broken):
```
User sets stroke to 30px
    ↓
... (same as above)
    ↓
queueEvent({ metadata: JSON.stringify(standardizedMeta) })
    ↓
❌ Metadata NOT saved to database OR
❌ Metadata NOT loaded from database OR
❌ Metadata NOT applied to state OR
❌ State NOT triggering re-render
    ↓
VectorLayer reads metadata.size = undefined or 2
    ↓
Polyline renders with weight: 2 (default)
```

## Potential Failure Points

### 1. PropertyPanel → Normalization
```typescript
// In PropertyPanel.tsx handleSave()
const metaToSave = { ...localMeta };
const standardizedMeta = normalizeMetadataObject(metaToSave);
```

**Check**: Is `localMeta.size` being set correctly?
**Check**: Is `normalizeMetadataObject` preserving the `size` field?

### 2. Normalization → Event Queue
```typescript
await queueEvent({
  type: 'FeatureUpdated',
  payload: {
    id: feature.id,
    metadata: JSON.stringify(standardizedMeta)
  }
});
```

**Check**: Is `standardizedMeta.size` present in the payload?
**Check**: Is the event being queued successfully?

### 3. Event Queue → State Update
```typescript
// In designActionSlice.ts
applyPatchToState(response)
// or
applyQueuedAckToState(response)
```

**Check**: Is the event being applied to state?
**Check**: Is `state.features[id].metadata` being updated?

### 4. State Update → Map Re-render
```typescript
// In VectorLayer.tsx
const metadata = getParsedMetadata(f, previewMetadata, groupThemePreview);
const weight = Number(metadata.weight || metadata.size) || 5;
```

**Check**: Is `getParsedMetadata` reading the updated metadata?
**Check**: Is the component re-rendering with new state?

### 5. Database Persistence
```sql
-- Check if metadata is being saved
SELECT payload_json FROM design_events 
WHERE event_type = 'FeatureUpdated' 
ORDER BY timestamp DESC LIMIT 10;
```

**Check**: Is the metadata being written to SQLite?
**Check**: Is it being loaded back on next page load?

## Diagnostic Steps

### Step 1: Check PropertyPanel localMeta
```typescript
// In handleSave(), before normalization
console.log('[PropertyPanel] localMeta.size:', localMeta.size);
```

### Step 2: Check Normalization Output
```typescript
// After normalizeMetadataObject
console.log('[PropertyPanel] standardizedMeta.size:', standardizedMeta.size);
```

### Step 3: Check Event Payload
```typescript
// In queueEvent call
console.log('[PropertyPanel] Payload metadata:', JSON.stringify(standardizedMeta));
```

### Step 4: Check State After Save
```typescript
// After queueEvent completes
const state = useDesignSync.getState().state;
const feature = state?.features[featureId];
const meta = JSON.parse(feature?.metadata || '{}');
console.log('[VectorLayer] State metadata.size:', meta.size);
```

### Step 5: Check VectorLayer Metadata
```typescript
// In VectorLayer.tsx, before rendering
console.log('[VectorLayer] metadata:', metadata);
console.log('[VectorLayer] metadata.size:', metadata.size);
```

## Expected Console Output (After Fix)

```
[PropertyPanel] 💾 Saving feature: <id>
[PropertyPanel] 📝 localMeta.size: 30
[PropertyPanel] ✅ Size converted to number: 30
[PropertyPanel] ✅ Standardized metadata.size: 30
[PropertyPanel] 📦 Payload metadata: {"size":30,"color":"#ffa500",...}
[PropertyPanel] ✅ Event queued successfully
[PropertyPanel] 🔄 Map should re-render
[VectorLayer] 🔍 metadata.size: 30
[VectorLayer] ✅ Rendering polyline 8 with 152 points ▶ {weight: 30}
```

## Immediate Action Plan

1. ✅ Add comprehensive logging to PropertyPanel.handleSave
2. ✅ Add validation that size is preserved after normalization
3. ✅ Add logging in VectorLayer to show what metadata is being read
4. ✅ Force re-render after save completes
5. ✅ Test with console open to verify the fix

## Files to Modify

1. `PropertyPanel.tsx` - Add validation and force re-render
2. `VectorLayer.tsx` - Add metadata logging
3. `designActionSlice.ts` - Verify event application (if needed)
4. `mapStateSlice.ts` - Verify state update (if needed)

## Testing Checklist

- [ ] Set stroke to 30px in PropertyPanel
- [ ] Click "SAVE SPECS"
- [ ] Verify console shows size=30 throughout the flow
- [ ] Verify polyline is visible with 30px weight
- [ ] Reload page and verify metadata persists
- [ ] Check database for saved metadata
