# Polyline Visibility Issue - Comprehensive Fix Plan

## Problem Summary
From console logs, polylines ARE rendering (`[VectorLayer] ✅ Rendering polyline 8 with 152 points`), but with `weight: 2` instead of the set value (28-30px). This confirms **metadata is not being saved or synchronized correctly**.

## Root Causes Identified

### 1. Metadata Not Persisting
- User sets stroke to 30px in PropertyPanel
- Console shows `weight: 2` when rendering
- Metadata changes are not being saved to database or not being loaded back

### 2. Potential Failure Points

#### A. Save Flow Issue
```
PropertyPanel → normalizeMetadataObject → queueEvent → Database
```
- `normalizeMetadataObject` might be stripping the `size` field
- `queueEvent` might not be persisting the metadata
- Database write might be failing silently

#### B. Load Flow Issue
```
Database → hydrate state → VectorLayer reads metadata
```
- Metadata might not be loaded from database
- State hydration might be using cached/old data
- VectorLayer might be reading stale metadata

#### C. Re-render Issue
```
State update → React re-render → VectorLayer updates
```
- State update might not trigger re-render
- React.memo might be preventing update
- Metadata change might not be detected

## Fix Implementation Plan

### Phase 1: Enhanced Debugging
Add comprehensive logging to track exactly where metadata is lost:

**PropertyPanel.tsx:**
```typescript
const handleSave = async () => {
  console.log('[PropertyPanel] 💾 Saving feature:', feature.id);
  console.log('[PropertyPanel] 📝 localMeta.size:', localMeta.size);
  
  const standardizedMeta = normalizeMetadataObject(localMeta);
  console.log('[PropertyPanel] ✅ standardizedMeta.size:', standardizedMeta.size);
  
  await queueEvent({
    type: 'FeatureUpdated',
    payload: {
      id: feature.id,
      metadata: JSON.stringify(standardizedMeta)
    }
  });
  
  console.log('[PropertyPanel] ✅ Event queued');
  console.log('[PropertyPanel] 🔄 Forcing re-render...');
};
```

**VectorLayer.tsx:**
```typescript
const metadata = getParsedMetadata(f, previewMetadata, groupThemePreview);
console.log('[VectorLayer] 🔍 Feature:', f.name);
console.log('[VectorLayer] 🔍 metadata.size:', metadata.size);
console.log('[VectorLayer] 🔍 metadata.weight:', metadata.weight);
```

### Phase 2: Fix Metadata Preservation

**metadataNormalization.ts:**
```typescript
export const normalizeMetadataObject = (metadata: any): FeatureMetadata => {
  const raw: AnyMeta = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    // CRITICAL: Preserve size/weight/stroke fields
    if (['size', 'weight', 'stroke'].includes(key) && value !== undefined && value !== '') {
      raw[key] = Number(value) || 0;
      continue;
    }
    // ... rest of normalization
  }
  
  // ... rest of function
};
```

### Phase 3: Force Re-render After Save

**PropertyPanel.tsx:**
```typescript
const handleSave = async () => {
  // ... save logic
  
  await queueEvent({ ... });
  
  // Force state update to trigger re-render
  const { state } = useDesignSync.getState();
  useDesignSync.setState({ state: { ...state } });
  
  console.log('[PropertyPanel] ✅ Forced re-render');
};
```

### Phase 4: Verify Database Write

Add database verification:
```typescript
const handleSave = async () => {
  // ... save logic
  
  await queueEvent({ ... });
  
  // Wait a bit for database write
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Verify metadata was saved
  const { state } = useDesignSync.getState();
  const feature = state?.features[feature.id];
  const meta = JSON.parse(feature?.metadata || '{}');
  
  console.log('[PropertyPanel] 🔍 Verify save:');
  console.log('[PropertyPanel]   Expected size:', localMeta.size);
  console.log('[PropertyPanel]   Actual size:', meta.size);
  
  if (meta.size !== localMeta.size) {
    console.error('[PropertyPanel] ❌ Metadata was not saved correctly!');
  }
};
```

## Testing Checklist

### Step 1: Run Diagnostic
```javascript
// In browser console
window.runPolylineDiagnostic();
```

Expected output:
```
📏 Polyline features found: X
✅ Features with valid coords: X
✅ Features with size metadata: X  ← Should match number of polylines
```

### Step 2: Save and Verify
1. Select a polyline
2. Set stroke to 30px
3. Click "SAVE SPECS"
4. Check console for:
   ```
   [PropertyPanel] 💾 Saving feature: <id>
   [PropertyPanel] 📝 localMeta.size: 30
   [PropertyPanel] ✅ standardizedMeta.size: 30
   [PropertyPanel] ✅ Event queued
   [PropertyPanel] 🔍 Verify save:
   [PropertyPanel]   Expected size: 30
   [PropertyPanel]   Actual size: 30  ← Should match!
   ```

### Step 3: Verify Rendering
Check console for:
```
[VectorLayer] 🔍 Feature: <name>
[VectorLayer] 🔍 metadata.size: 30  ← Should be 30!
[VectorLayer] 🔍 metadata.weight: undefined
[VectorLayer] ✅ Rendering polyline with weight: 30
```

### Step 4: Verify Visibility
- Polyline should be visible on map
- Weight should be 30px (thick line)
- Color should match the selected color

## Files to Modify

1. ✅ `PropertyPanel.tsx` - Enhanced save logging and verification
2. ✅ `VectorLayer.tsx` - Metadata logging
3. ✅ `metadataNormalization.ts` - Preserve size/weight/stroke fields
4. ✅ `designActionSlice.ts` - Ensure state updates trigger re-renders

## Expected Behavior After Fix

1. User sets stroke to 30px
2. Clicks "SAVE SPECS"
3. Console shows metadata is saved correctly
4. Polyline immediately updates to 30px weight
5. Reload page - metadata persists
6. Polyline remains visible with correct weight

## Rollback Plan

If the fix doesn't work:
1. Check console logs to identify which phase failed
2. Check database directly:
   ```sql
   SELECT event_id, payload_json 
   FROM design_events 
   WHERE event_type = 'FeatureUpdated' 
   AND payload_json LIKE '%"size"%'
   ORDER BY timestamp DESC LIMIT 10;
   ```
3. Verify event is being applied to state
4. Check if React is detecting the state change

## Additional Notes

- The issue is NOT with coordinates (they're valid)
- The issue is NOT with visibility filtering (polylines are being passed to VectorLayer)
- The issue IS with metadata persistence (size value is lost)
- Focus on the save/load cycle for metadata
