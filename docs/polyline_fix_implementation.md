# Polyline Visibility Fix - Implementation

## Root Cause
Metadata (`size` field) is not being saved or loaded correctly, causing polylines to render with default weight (2px) instead of the user-set value (28-30px).

## Solution Overview

### 1. Enhanced Save Flow with Validation
Add comprehensive logging and validation in PropertyPanel to ensure metadata is preserved.

### 2. Force State Update After Save
Ensure the map re-renders with the new metadata.

### 3. Verify Metadata Persistence
Confirm the metadata is actually saved to the database.

## Implementation

### File 1: PropertyPanel.tsx

```typescript
const handleSave = async () => {
  if (!feature) return;
  setIsSaving(true);
  setIsSaved(false);

  console.log('[PropertyPanel] 💾 Saving feature:', feature.id);
  console.log('[PropertyPanel] 📝 localMeta before save:', JSON.stringify(localMeta, null, 2));
  console.log('[PropertyPanel] 🔧 Size/Stroke value:', localMeta.size);
  console.log('[PropertyPanel] 🎨 Color value:', localMeta.color);

  try {
    // CRITICAL: Ensure size is a valid number
    const metaToSave = { ...localMeta };
    if (metaToSave.size !== undefined && metaToSave.size !== '') {
      metaToSave.size = Number(metaToSave.size);
      if (isNaN(metaToSave.size)) {
        console.warn('[PropertyPanel] ⚠️ Invalid size value, using default (4)');
        metaToSave.size = 4;
      }
      console.log('[PropertyPanel] ✅ Size validated:', metaToSave.size);
    }

    // Normalize before saving
    const standardizedMeta = normalizeMetadataObject(metaToSave);

    console.log('[PropertyPanel] ✅ Standardized metadata:', JSON.stringify(standardizedMeta, null, 2));
    console.log('[PropertyPanel] 📦 Final payload size:', standardizedMeta.size);

    // CRITICAL VALIDATION: Ensure size was preserved
    if (!standardizedMeta.size && metaToSave.size) {
      console.error('[PropertyPanel] ❌ CRITICAL: Size was lost during normalization!');
      console.error('[PropertyPanel] Input size:', metaToSave.size);
      console.error('[PropertyPanel] Output size:', standardizedMeta.size);
      
      // Force preserve size
      standardizedMeta.size = metaToSave.size;
      console.log('[PropertyPanel] ✅ Size restored after normalization:', standardizedMeta.size);
    }

    // Save to database
    await queueEvent({
      type: 'FeatureUpdated',
      payload: {
        id: feature.id,
        name: localName,
        metadata: JSON.stringify(standardizedMeta)
      }
    });

    console.log('[PropertyPanel] ✅ Event queued successfully');

    // CRITICAL: Force state update to trigger re-render
    const currentState = useDesignSync.getState().state;
    if (currentState) {
      useDesignSync.setState({ state: { ...currentState } });
      console.log('[PropertyPanel] 🔄 Forced state update for re-render');
    }

    // CRITICAL: Verify save was successful
    await new Promise(resolve => setTimeout(resolve, 300));
    const verifyState = useDesignSync.getState().state;
    const verifyFeature = verifyState?.features[feature.id];
    if (verifyFeature) {
      const verifyMeta = typeof verifyFeature.metadata === 'string' 
        ? JSON.parse(verifyFeature.metadata) 
        : verifyFeature.metadata;
      
      console.log('[PropertyPanel] 🔍 Verification:');
      console.log('[PropertyPanel]   Expected size:', metaToSave.size);
      console.log('[PropertyPanel]   Actual size:', verifyMeta.size);
      
      if (verifyMeta.size !== metaToSave.size) {
        console.error('[PropertyPanel] ❌ Metadata was not saved correctly!');
        console.error('[PropertyPanel] This indicates a database write issue.');
      } else {
        console.log('[PropertyPanel] ✅ Metadata saved successfully!');
      }
    }

    // Success feedback
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);

    // Clear preview after save
    setPreview(null, null);
  } catch (error) {
    console.error("[PropertyPanel] ❌ Save failed:", error);
    alert("Lỗi khi lưu dữ liệu. Vui lòng thử lại.");
  } finally {
    setIsSaving(false);
  }
};
```

### File 2: VectorLayer.tsx

```typescript
// Add at the beginning of the component, before the return statement
React.useEffect(() => {
  console.log('[VectorLayer] 🔍 Metadata inspection for polylines:');
  features.filter((f: any) => {
    const geomType = (f.geom_type || '').toLowerCase();
    return geomType === 'linestring' || geomType === 'polyline' || geomType === 'line';
  }).forEach((f: any) => {
    const metadata = getParsedMetadata(f, previewMetadata, groupThemePreview);
    console.log(`[VectorLayer]   Feature: ${f.name || f.id}`);
    console.log(`[VectorLayer]     metadata.size:`, metadata.size);
    console.log(`[VectorLayer]     metadata.weight:`, metadata.weight);
    console.log(`[VectorLayer]     metadata.stroke:`, metadata.stroke);
    console.log(`[VectorLayer]     Raw metadata:`, f.metadata);
  });
}, [features]);
```

### File 3: metadataNormalization.ts

```typescript
export const normalizeMetadataObject = (metadata: any): FeatureMetadata => {
  const raw: AnyMeta = {};
  
  // CRITICAL: First pass - preserve numeric fields
  for (const [key, value] of Object.entries(metadata || {})) {
    // Special handling for size/weight/stroke fields
    if (['size', 'weight', 'stroke'].includes(key)) {
      if (value !== undefined && value !== null && value !== '') {
        const numValue = Number(value);
        if (!isNaN(numValue) && isFinite(numValue)) {
          raw[key] = numValue;
          console.log(`[Normalization] ✅ Preserved ${key}:`, numValue);
        }
      }
      continue;
    }
    
    const v = normalizeValue(key, value);
    if (!pruneEmpty(v)) raw[key] = v;
  }

  const result: FeatureMetadata = {
    // ... existing code ...
    size: raw.size || raw.gis?.size,
    // ... rest of fields ...
  };

  // CRITICAL: Final validation - ensure size is present if it was in input
  if (!result.size && metadata?.size) {
    console.warn('[Normalization] ⚠️ Size was lost, restoring from input');
    result.size = Number(metadata.size) || undefined;
  }

  return result;
};
```

## Testing Steps

1. **Open browser console** (F12)
2. **Select a polyline** feature
3. **Set stroke to 30px** in PropertyPanel
4. **Click "SAVE SPECS"**
5. **Check console output:**

Expected output:
```
[PropertyPanel] 💾 Saving feature: <id>
[PropertyPanel] 📝 localMeta before save: { size: 30, color: "#ffa500" }
[PropertyPanel] 🔧 Size/Stroke value: 30
[PropertyPanel] ✅ Size validated: 30
[PropertyPanel] ✅ Standardized metadata: { size: 30, color: "#ffa500", ... }
[PropertyPanel] 📦 Final payload size: 30
[PropertyPanel] ✅ Event queued successfully
[PropertyPanel] 🔄 Forced state update for re-render
[PropertyPanel] 🔍 Verification:
[PropertyPanel]   Expected size: 30
[PropertyPanel]   Actual size: 30
[PropertyPanel] ✅ Metadata saved successfully!
[VectorLayer] 🔍 Metadata inspection for polylines:
[VectorLayer]   Feature: <name>
[VectorLayer]     metadata.size: 30
[VectorLayer]     metadata.weight: undefined
[VectorLayer]     metadata.stroke: undefined
```

6. **Verify polyline is visible** on the map with 30px weight

## Troubleshooting

### If size shows as undefined in VectorLayer:
- Check if the event was actually applied to state
- Check database for the saved metadata
- Verify the feature ID matches

### If polyline still not visible:
- Check console for any errors
- Verify coordinates are valid
- Check if feature is hidden by visibility settings

### If metadata not persisting after reload:
- Check database write is successful
- Verify hydration is loading the correct metadata
- Check if there's a caching issue

## Success Criteria

✅ Console shows `metadata.size: 30` in VectorLayer  
✅ Polyline is visible on map with 30px weight  
✅ Metadata persists after page reload  
✅ No errors in console  

## Files Modified

1. `PropertyPanel.tsx` - Enhanced save flow with validation
2. `VectorLayer.tsx` - Added metadata inspection logging
3. `metadataNormalization.ts` - Ensured size field preservation
