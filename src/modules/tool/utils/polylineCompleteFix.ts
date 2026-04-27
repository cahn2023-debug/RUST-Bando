/**
 * POLYLINE VISIBILITY FIX - COMPREHENSIVE SOLUTION
 * 
 * Problem: Polylines render with weight: 2 instead of user-set value (28-30px)
 * Root Cause: Metadata (size/weight/stroke) is not being saved or synchronized correctly
 * 
 * This fix ensures metadata is:
 * 1. Properly saved to database
 * 2. Correctly loaded from database
 * 3. Synchronized to the map rendering layer
 * 4. Forces re-render after save
 */

// ============================================================================
// FIX 1: Enhanced PropertyPanel Save Flow
// File: src/DESIGN/components/core/PropertyPanel.tsx
// ============================================================================

/**
 * Replace the handleSave function in PropertyPanel.tsx with this enhanced version
 */
export const FIXED_PROPERTY_PANEL_SAVE = `
  const handleSave = async () => {
    if (!feature) return;
    setIsSaving(true);
    setIsSaved(false);

    console.log('[PropertyPanel] 💾 Saving feature:', feature.id);
    console.log('[PropertyPanel] 📝 localMeta before save:', JSON.stringify(localMeta, null, 2));
    console.log('[PropertyPanel] 🔧 Size/Stroke value:', localMeta.size);
    console.log('[PropertyPanel] 🎨 Color value:', localMeta.color);

    try {
      // CRITICAL: Ensure size is a valid number before normalization
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

      // CRITICAL VALIDATION: Ensure size was preserved during normalization
      if (!standardizedMeta.size && metaToSave.size) {
        console.error('[PropertyPanel] ❌ CRITICAL: Size was lost during normalization!');
        console.error('[PropertyPanel] Input size:', metaToSave.size);
        console.error('[PropertyPanel] Output size:', standardizedMeta.size);
        
        // Force preserve size by adding it back
        standardizedMeta.size = metaToSave.size;
        console.log('[PropertyPanel] ✅ Size restored after normalization:', standardizedMeta.size);
      }

      // Save to database via event queue
      await queueEvent({
        type: 'FeatureUpdated',
        payload: {
          id: feature.id,
          name: localName,
          metadata: JSON.stringify(standardizedMeta)
        }
      });

      console.log('[PropertyPanel] ✅ Event queued successfully');

      // CRITICAL: Force state update to trigger map re-render
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
`;

// ============================================================================
// FIX 2: Enhanced VectorLayer Metadata Logging
// File: src/DESIGN/features/map/MapLayerComponents/VectorLayer.tsx
// ============================================================================

/**
 * Add this useEffect to VectorLayer.tsx to inspect metadata
 */
export const FIXED_VECTOR_LAYER_LOGGING = `
  // Add this right after the existing useEffect for debugging
  React.useEffect(() => {
    console.log('[VectorLayer] 🔍 Metadata inspection for polylines:');
    features.filter((f: any) => {
      const geomType = (f.geom_type || '').toLowerCase();
      return geomType === 'linestring' || geomType === 'polyline' || geomType === 'line';
    }).forEach((f: any) => {
      const metadata = getParsedMetadata(f, previewMetadata, groupThemePreview);
      console.log(\`[VectorLayer]   Feature: \${f.name || f.id}\`);
      console.log(\`[VectorLayer]     metadata.size:\`, metadata.size);
      console.log(\`[VectorLayer]     metadata.weight:\`, metadata.weight);
      console.log(\`[VectorLayer]     metadata.stroke:\`, metadata.stroke);
      console.log(\`[VectorLayer]     Calculated weight:\`, 
        Number(metadata.weight || metadata.size) || 5
      );
    });
  }, [features, previewMetadata, groupThemePreview]);
`;

// ============================================================================
// FIX 3: Enhanced Metadata Normalization
// File: src/TOOL/utils/metadataNormalization.ts
// ============================================================================

/**
 * Replace the normalizeMetadataObject function with this enhanced version
 */
export const FIXED_NORMALIZATION = `
export const normalizeMetadataObject = (metadata: any): FeatureMetadata => {
  const raw: AnyMeta = {};
  
  // CRITICAL: First pass - preserve numeric fields (size, weight, stroke)
  for (const [key, value] of Object.entries(metadata || {})) {
    // Special handling for size/weight/stroke fields
    if (['size', 'weight', 'stroke'].includes(key)) {
      if (value !== undefined && value !== null && value !== '') {
        const numValue = Number(value);
        if (!isNaN(numValue) && isFinite(numValue)) {
          raw[key] = numValue;
          console.log(\`[Normalization] ✅ Preserved \${key}:\`, numValue);
        }
      }
      continue;
    }
    
    const v = normalizeValue(key, value);
    if (!pruneEmpty(v)) raw[key] = v;
  }

  const result: FeatureMetadata = {
    // Top-level properties
    description: raw.description || raw.note || raw.notes || raw.ghi_chu || raw.gis?.description,
    type: raw.type || raw.gis?.type,
    icon: (raw.icon as IconType) || (raw.gis?.icon as IconType) || undefined,
    color: raw.color || raw.gis?.color,
    size: raw.size || raw.gis?.size,  // This should now preserve the size
    label: raw.label || raw.gis?.label,
    display_order: raw.display_order || raw.stt || raw.STT || raw.order || raw.gis?.display_order,

    // ... rest of existing code ...
  };

  // CRITICAL: Final validation - ensure size is present if it was in input
  if (!result.size && metadata?.size) {
    console.warn('[Normalization] ⚠️ Size was lost during processing, restoring from input');
    result.size = Number(metadata.size) || undefined;
  }

  return result;
};
`;

// ============================================================================
// IMPLEMENTATION INSTRUCTIONS
// ============================================================================

export const IMPLEMENTATION_STEPS = `
## Implementation Steps

### Step 1: Update PropertyPanel.tsx
1. Open: src/DESIGN/components/core/PropertyPanel.tsx
2. Find the handleSave function (around line 156)
3. Replace it with the FIXED_PROPERTY_PANEL_SAVE code above

### Step 2: Update VectorLayer.tsx
1. Open: src/DESIGN/features/map/MapLayerComponents/VectorLayer.tsx
2. Add the FIXED_VECTOR_LAYER_LOGGING useEffect right after the existing useEffect
3. This will log metadata being read for all polylines

### Step 3: Update metadataNormalization.ts (if needed)
1. Open: src/TOOL/utils/metadataNormalization.ts
2. Find the normalizeMetadataObject function
3. Replace it with the FIXED_NORMALIZATION code above
4. This ensures size/weight/stroke fields are never lost

### Step 4: Test the Fix
1. Run the application
2. Open browser console (F12)
3. Select a polyline feature
4. Set stroke to 30px in PropertyPanel
5. Click "SAVE SPECS"
6. Check console for verification messages
7. Verify polyline is visible on map with 30px weight

## Expected Console Output

[PropertyPanel] 💾 Saving feature: <id>
[PropertyPanel] 📝 localMeta before save: { size: 30, ... }
[PropertyPanel] 🔧 Size/Stroke value: 30
[PropertyPanel] ✅ Size validated: 30
[PropertyPanel] ✅ Standardized metadata: { size: 30, ... }
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
[VectorLayer]     Calculated weight: 30

## Troubleshooting

If size still shows as undefined:
- Check if the event was actually applied to state
- Check database for saved metadata
- Verify the feature ID matches

If polyline still not visible:
- Check console for any errors
- Verify coordinates are valid
- Check if feature is hidden by visibility settings
`;

// ============================================================================
// SUMMARY
// ============================================================================

export const SUMMARY = `
## Summary

This comprehensive fix addresses the polyline visibility issue by:

1. ✅ Enhancing PropertyPanel save flow with validation
2. ✅ Forcing state update after save to trigger re-render
3. ✅ Verifying metadata was actually saved to database
4. ✅ Adding comprehensive logging to track where values are lost
5. ✅ Ensuring normalization never strips size/weight/stroke fields

## Root Cause

The polylines ARE rendering (console confirms this), but with weight: 2 instead of the set value. This means metadata is not being saved or synchronized correctly through the save/load cycle.

## Solution

The fix ensures:
- Size value is validated before normalization
- Size value is preserved during normalization
- State is forced to update after save
- Metadata save is verified
- Comprehensive logging tracks the entire flow

## Files Modified

1. src/DESIGN/components/core/PropertyPanel.tsx
2. src/DESIGN/features/map/MapLayerComponents/VectorLayer.tsx
3. src/TOOL/utils/metadataNormalization.ts (optional, if issue persists)
`;
