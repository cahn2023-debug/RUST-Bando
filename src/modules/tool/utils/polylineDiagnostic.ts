/**
 * Polyline Diagnostic Tool - Run in browser console
 * 
 * This tool will help identify exactly where polylines are failing to display.
 * It checks coordinates, metadata, visibility, and rendering state.
 */

export const runPolylineDiagnostic = () => {
  console.log('🔍 === POLYLINE DIAGNOSTIC START ===\n');

  // Get store state
  const store = (window as any).__DESIGN_SYNC_STORE__;
  if (!store) {
    console.error('❌ Cannot access useDesignSync store');
    return null;
  }

  const state = store.getState()?.state;
  if (!state) {
    console.error('❌ No state loaded');
    return null;
  }

  console.log('📊 Total features:', Object.keys(state.features).length);

  // Find all polyline features
  const polylineFeatures = Object.values(state.features).filter((f: any) => {
    const geomType = (f.geom_type || '').toLowerCase();
    return geomType === 'linestring' || geomType === 'polyline' || geomType === 'line';
  });

  console.log('📏 Polyline features found:', polylineFeatures.length, '\n');

  if (polylineFeatures.length === 0) {
    console.warn('⚠️ No polyline features found!');
    console.log('Available geom_types:', [...new Set(Object.values(state.features).map((f: any) => f.geom_type))]);
    return null;
  }

  // Analyze each polyline
  polylineFeatures.forEach((f: any, idx: number) => {
    console.group(`📐 Polyline #${idx + 1}: ${f.name || f.id}`);

    // 1. Basic info
    console.log('ID:', f.id);
    console.log('Name:', f.name);
    console.log('geom_type:', f.geom_type);
    console.log('group_id:', f.group_id);
    console.log('layer_id:', f.layer_id);

    // 2. Parse coordinates
    let coords: any = f.coordinates;
    try {
      if (typeof coords === 'string') {
        coords = JSON.parse(coords);
      }
    } catch (e) {
      console.error('❌ Failed to parse coordinates:', e);
    }

    console.log('\n📍 Coordinates:');
    console.log('  Type:', typeof coords);
    console.log('  Is array:', Array.isArray(coords));
    console.log('  Length:', Array.isArray(coords) ? coords.length : 'N/A');

    if (Array.isArray(coords) && coords.length > 0) {
      if (Array.isArray(coords[0])) {
        console.log('  Format: Multi-point [[lng, lat], ...]');
        console.log('  First 3 points:', coords.slice(0, 3));
      } else if (coords.length > 2 && typeof coords[0] === 'number') {
        console.log('  Format: Flat array [lng, lat, lng, lat, ...]');
        console.log('  First 6 values:', coords.slice(0, 6));
        console.log('  Would create', Math.floor(coords.length / 2), 'points');
      } else {
        console.log('  Format: Single point [lng, lat]');
        console.log('  Value:', coords);
      }

      // Validate coordinate ranges
      const firstPoint = Array.isArray(coords[0]) ? coords[0] : coords;
      if (firstPoint.length >= 2) {
        const [lng, lat] = firstPoint;
        if (lng < -180 || lng > 180) console.warn('  ⚠️ Invalid longitude:', lng);
        if (lat < -90 || lat > 90) console.warn('  ⚠️ Invalid latitude:', lat);
        console.log('  First point:', { lng, lat });
      }
    } else {
      console.error('  ❌ Coordinates are invalid or empty');
      console.log('  Raw value:', f.coordinates);
    }

    // 3. Parse metadata
    let metadata: any = {};
    try {
      metadata = typeof f.metadata === 'string' ? JSON.parse(f.metadata || '{}') : (f.metadata || {});
    } catch (e) {
      console.error('❌ Failed to parse metadata:', e);
    }

    console.log('\n📝 Metadata:');
    console.log('  size/stroke:', metadata.size);
    console.log('  weight:', metadata.weight);
    console.log('  color:', metadata.color);
    console.log('  Full metadata:', metadata);

    // 4. Check group and layer visibility
    const group = f.group_id ? state.feature_groups?.[f.group_id] : null;
    const layer = group ? state.layers?.[group.layer_id] : null;

    console.log('\n👁️ Visibility:');
    console.log('  Group:', group?.name || 'None');
    console.log('  Layer:', layer?.name || 'None');
    console.log('  Group is_visible:', group?.is_visible);
    console.log('  Layer is_visible:', layer?.is_visible);
    console.log('  Metadata is_visible:', metadata.is_visible);

    // 5. Check if hidden
    const mapHiddenIds = store.getState()?.mapHiddenIds || new Set();
    const isHidden = mapHiddenIds.has(f.id) ||
      (f.group_id && mapHiddenIds.has(f.group_id)) ||
      (layer && mapHiddenIds.has(layer.id));
    console.log('  Hidden by mapHiddenIds:', isHidden);

    // 6. Expected rendering
    const expectedWeight = Number(metadata.weight || metadata.size) || 5;
    console.log('\n🎨 Expected rendering:');
    console.log('  Weight:', expectedWeight, 'px');
    console.log('  Color:', metadata.color || '#3B82F6');
    console.log('  Should be visible:', expectedWeight > 0 && !isHidden);

    console.groupEnd();
    console.log('');
  });

  // Summary
  console.log('📊 === SUMMARY ===');
  console.log('Total polyline features:', polylineFeatures.length);
  
  const validCoords = polylineFeatures.filter((f: any) => {
    let coords = f.coordinates;
    try { coords = typeof coords === 'string' ? JSON.parse(coords) : coords; } catch { return false; }
    return Array.isArray(coords) && coords.length > 0;
  }).length;
  console.log('✅ Features with valid coords:', validCoords);
  
  const withSize = polylineFeatures.filter((f: any) => {
    let meta: any = {};
    try { meta = typeof f.metadata === 'string' ? JSON.parse(f.metadata) : f.metadata; } catch { return false; }
    return meta.size !== undefined && meta.size > 0;
  }).length;
  console.log('✅ Features with size metadata:', withSize);
  
  const hiddenCount = polylineFeatures.filter((f: any) => {
    const mapHiddenIds = store.getState()?.mapHiddenIds || new Set();
    return mapHiddenIds.has(f.id) || (f.group_id && mapHiddenIds.has(f.group_id));
  }).length;
  console.log('⚠️ Hidden features:', hiddenCount);
  console.log('✅ Visible features:', polylineFeatures.length - hiddenCount);

  console.log('\n🔍 === DIAGNOSTIC END ===');
  console.log('\n💡 Common issues:');
  if (validCoords === 0) console.log('  ❌ No valid coordinates - check coordinate parsing');
  if (withSize === 0) console.log('  ❌ No size metadata - metadata not being saved');
  if (hiddenCount > 0) console.log('  ⚠️ Some features hidden - check visibility settings');
  if (validCoords > 0 && withSize > 0 && hiddenCount === 0) {
    console.log('  ✅ All looks good - issue might be in rendering layer');
  }

  return polylineFeatures;
};

// Make it globally accessible
if (typeof window !== 'undefined') {
  (window as any).runPolylineDiagnostic = runPolylineDiagnostic;
  console.log('✅ Polyline diagnostic tool loaded. Run: window.runPolylineDiagnostic()');
}
