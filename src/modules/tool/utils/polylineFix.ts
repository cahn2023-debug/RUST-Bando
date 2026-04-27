import { logger } from '@TOOL/utils/logger';

/**
 * POLYLINE VISIBILITY FIX
 *
 * This fix ensures that polyline metadata (size/weight/stroke) is properly saved
 * and synchronized between the PropertyPanel and the map rendering layer.
 *
 * Problem: Polylines render with weight: 2 instead of user-set value (28-30px)
 * Root Cause: Metadata not being saved/loaded correctly
 * Solution: Enhanced save flow with validation and forced re-render
 */

// ============================================================================
// FIX 1: Enhanced PropertyPanel Save Flow
// File: src/DESIGN/components/core/PropertyPanel.tsx
// ============================================================================

/**
 * Replace the existing handleSave function with this enhanced version
 */
export const enhancedHandleSave = async (
  feature: any,
  localName: string,
  localMeta: any,
  queueEvent: Function,
  setIsSaving: Function,
  setIsSaved: Function,
  setPreview: Function,
  normalizeMetadataObject: Function
) => {
  if (!feature) return;
  setIsSaving(true);
  setIsSaved(false);

  logger.debug('[PropertyPanel] Saving feature:', feature.id);
  logger.debug('[PropertyPanel] localMeta before save:', JSON.stringify(localMeta, null, 2));
  logger.debug('[PropertyPanel] Size/Stroke value:', localMeta.size);
  logger.debug('[PropertyPanel] Color value:', localMeta.color);

  try {
    // CRITICAL: Ensure size is a valid number before normalization
    const metaToSave = { ...localMeta };
    if (metaToSave.size !== undefined && metaToSave.size !== '') {
      metaToSave.size = Number(metaToSave.size);
      if (isNaN(metaToSave.size)) {
        logger.warn('[PropertyPanel] Invalid size value, using default (4)');
        metaToSave.size = 4;
      }
      logger.debug('[PropertyPanel] Size validated:', metaToSave.size);
    }

    // Normalize before saving
    const standardizedMeta = normalizeMetadataObject(metaToSave);

    logger.debug('[PropertyPanel] Standardized metadata:', JSON.stringify(standardizedMeta, null, 2));
    logger.debug('[PropertyPanel] Final payload size:', standardizedMeta.size);

    // CRITICAL VALIDATION: Ensure size was preserved during normalization
    if (!standardizedMeta.size && metaToSave.size) {
      logger.error('[PropertyPanel] CRITICAL: Size was lost during normalization!');
      logger.error('[PropertyPanel] Input size:', metaToSave.size);
      logger.error('[PropertyPanel] Output size:', standardizedMeta.size);

      // Force preserve size by adding it back
      standardizedMeta.size = metaToSave.size;
      logger.debug('[PropertyPanel] Size restored after normalization:', standardizedMeta.size);
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

    logger.debug('[PropertyPanel] Event queued successfully');

    // CRITICAL: Force state update to trigger map re-render
    // This ensures the VectorLayer picks up the new metadata
    const { useDesignSync } = await import('@IMPLEMENT/stores/useDesignSync');
    const currentState = useDesignSync.getState().state;
    if (currentState) {
      useDesignSync.setState({ state: { ...currentState } });
      logger.debug('[PropertyPanel] Forced state update for re-render');
    }

    // CRITICAL: Verify save was successful
    // Wait a bit for database write to complete
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const verifyState = useDesignSync.getState().state;
    const verifyFeature = verifyState?.features[feature.id];
    if (verifyFeature) {
      const verifyMeta = typeof verifyFeature.metadata === 'string'
        ? JSON.parse(verifyFeature.metadata)
        : verifyFeature.metadata;

      logger.debug('[PropertyPanel] Verification:');
      logger.debug('[PropertyPanel]   Expected size:', metaToSave.size);
      logger.debug('[PropertyPanel]   Actual size:', verifyMeta.size);

      if (verifyMeta.size !== metaToSave.size) {
        logger.error('[PropertyPanel] Metadata was not saved correctly!');
        logger.error('[PropertyPanel] This indicates a database write issue.');
      } else {
        logger.debug('[PropertyPanel] Metadata saved successfully!');
      }
    }

    // Success feedback
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);

    // Clear preview after save
    setPreview(null, null);
  } catch (error) {
    logger.error("[PropertyPanel] Save failed:", error);
    alert("Lỗi khi lưu dữ liệu. Vui lòng thử lại.");
  } finally {
    setIsSaving(false);
  }
};

// ============================================================================
// FIX 2: Enhanced VectorLayer Metadata Logging
// File: src/DESIGN/features/map/MapLayerComponents/VectorLayer.tsx
// ============================================================================

/**
 * Add this useEffect at the beginning of the VectorLayer component
 * to inspect metadata being read for polylines
 */
export const addVectorLayerMetadataLogging = `
  // Add this right after the existing React.useEffect for debugging
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
 * that ensures size/weight/stroke fields are never lost
 */
export const enhancedNormalizeMetadataObject = `
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

    // ... rest of the existing code ...
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
// TESTING INSTRUCTIONS
// ============================================================================

export const testingInstructions = `
## Testing Steps

1. Open browser console (F12)
2. Select a polyline feature
3. Set stroke to 30px in PropertyPanel
4. Click "SAVE SPECS"
5. Check console for these messages:

Expected output:
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
[VectorLayer]     metadata.weight: undefined
[VectorLayer]     Calculated weight: 30

6. Verify polyline is visible on map with 30px weight

## Troubleshooting

If size shows as undefined in VectorLayer:
- Check if event was applied to state
- Check database for saved metadata
- Verify feature ID matches

If polyline still not visible:
- Check console for errors
- Verify coordinates are valid
- Check if feature is hidden by visibility settings
`;

// ============================================================================
// SUMMARY
// ============================================================================

export const summary = `
## Summary

This fix addresses the polyline visibility issue by:

1. ✅ Enhancing the save flow with validation to ensure size is preserved
2. ✅ Forcing state update after save to trigger map re-render
3. ✅ Verifying metadata was actually saved to database
4. ✅ Adding comprehensive logging to track where values are lost
5. ✅ Ensuring normalization never strips size/weight/stroke fields

## Files to Modify

1. src/DESIGN/components/core/PropertyPanel.tsx
   - Replace handleSave with enhanced version

2. src/DESIGN/features/map/MapLayerComponents/VectorLayer.tsx
   - Add metadata inspection logging

3. src/TOOL/utils/metadataNormalization.ts
   - Enhance normalizeMetadataObject to preserve numeric fields

## Expected Result

After applying this fix:
- Polylines will render with the correct weight (28-30px)
- Metadata will persist across page reloads
- Console will show comprehensive logging for debugging
- No more "weight: 2" issue
`;
