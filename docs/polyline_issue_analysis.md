# Polyline Visibility Issue - Root Cause Analysis

## Problem Summary
Polylines are NOT visible on the map, but console logs show they ARE being rendered:
```
[VectorLayer] ✅ Rendering polyline 8 with 152 points ▶ {color: '#3B82F6', weight: 2, isSelected: false}
```

**Key Finding**: The polyline IS rendering, but with `weight: 2` instead of the 28-30px set in the UI. This means **metadata is not being saved/loaded correctly**.

## Root Cause

### Issue 1: Metadata Not Persisting
When user sets stroke to 30px in PropertyPanel:
1. `localMeta.size` is updated to 30 ✅
2. User clicks "SAVE SPECS" ✅
3. `handleSave` calls `normalizeMetadataObject(localMeta)` ❓
4. Event is queued via `queueEvent` ✅
5. **BUT**: Console shows `weight: 2` on render ❌

This indicates one of:
- `normalizeMetadataObject` is stripping the `size` field
- The event is not applying the metadata update correctly
- The state is not re-rendering with the new metadata
- The metadata is being saved but not loaded back from database

### Issue 2: Potential Causes

#### A. Normalization Issue
```typescript
// In metadataNormalization.ts
const NUMBER_KEYS = new Set(['size', ...]);

const normalizeValue = (key: string, value: any): any => {
  if (value == null) return value; // ❌ If value is 0, it passes this check
  if (typeof value === 'string') {
    const cleaned = cleanString(value);
    if (NUMBER_KEYS.has(key)) {
      const num = Number(cleaned);
      return Number.isFinite(num) ? num : value;
    }
  }
  // ...
};
```

**Potential Issue**: If `size` is being converted to a string "30" and then back to number, or if it's being pruned as empty.

#### B. Save Flow Issue
```typescript
// In PropertyPanel.tsx
const handleSave = async () => {
  const standardizedMeta = normalizeMetadataObject(localMeta);
  await queueEvent({
    type: 'FeatureUpdated',
    payload: {
      id: feature.id,
      metadata: JSON.stringify(standardizedMeta)
    }
  });
};
```

**Potential Issue**: The event might not be triggering a state update that causes re-render.

#### C. Load Flow Issue
When the map re-renders, it reads from `state.features[id].metadata`, which might be:
- The old metadata (before save)
- Not updated due to state management issue
- Being read from cache instead of fresh state

## Solution Plan

### Step 1: Enhanced Debugging
Add comprehensive logging to track:
1. Value before normalization
2. Value after normalization
3. Value in the event payload
4. Value when read back from state
5. Value used in rendering

### Step 2: Force Metadata Preservation
Ensure `size` field is never lost:
```typescript
// Before normalization
const metaToSave = { ...localMeta };
if (metaToSave.size !== undefined) {
  metaToSave.size = Number(metaToSave.size);
  if (isNaN(metaToSave.size)) metaToSave.size = 4; // Default for polylines
}
```

### Step 3: Force Re-render
Ensure state update triggers re-render:
```typescript
// After queueEvent completes
await queueEvent({ ... });
// Force a state tick to ensure re-render
useDesignSync.getState().throttledSetState({});
```

### Step 4: Verify Database Write
Check if metadata is actually being saved to SQLite:
```sql
SELECT event_id, payload_json 
FROM design_events 
WHERE event_type = 'FeatureUpdated' 
AND payload_json LIKE '%"size"%'
ORDER BY timestamp DESC LIMIT 5;
```

## Files to Modify

1. **PropertyPanel.tsx** - Add validation and force re-render
2. **metadataNormalization.ts** - Ensure size field preservation
3. **VectorLayer.tsx** - Add metadata validation logging
4. **designActionSlice.ts** - Verify event application

## Expected Behavior After Fix

1. User sets stroke to 30px
2. Clicks "SAVE SPECS"
3. Console shows:
   ```
   [PropertyPanel] 💾 Saving: size=30
   [PropertyPanel] ✅ Normalized: size=30
   [PropertyPanel] 📦 Event payload: { size: 30 }
   [PropertyPanel] ✅ Event queued
   [VectorLayer] 🔍 Metadata: size=30
   [VectorLayer] ✅ Rendering with weight=30
   ```
4. Polyline is visible with 30px width

## Testing Checklist

- [ ] Set stroke to 30px in PropertyPanel
- [ ] Click "SAVE SPECS"
- [ ] Check console for size=30 throughout the flow
- [ ] Verify polyline is visible on map
- [ ] Reload page and verify metadata persists
- [ ] Check SQLite database for saved metadata
