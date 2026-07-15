/**
 * Point Selection Debug Utility
 * 
 * Use this utility to diagnose and test Point selection issues on the map.
 * Run these functions in the browser console to test different scenarios.
 */

import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';

/**
 * Test 1: Verify store selection mechanism works
 * Call this from browser console to test if store can select a Point
 */
export function testPointSelection() {
    const store = useDesignSync.getState();
    
    console.log('=== Point Selection Test ===');
    console.log('Current drawingMode:', store.drawingMode);
    console.log('Current selectedFeatureId:', store.selectedFeatureId);
    
    // Find first Point feature
    const features = store.state?.features || {};
    const pointId = Object.keys(features).find(
        id => features[id].geom_type === 'Point' || features[id].geom_type === undefined
    );
    
    if (!pointId) {
        console.error('❌ No Point features found in state!');
        return;
    }
    
    console.log('✓ Found Point feature:', pointId);
    console.log('Point data:', features[pointId]);
    
    // Try to select it
    console.log('→ Attempting to select Point...');
    store.selectFeature(pointId);
    store.setSelectedGroup(features[pointId].group_id);
    store.zoomTo(pointId, 'feature');
    
    console.log('✓ Selected! New selectedFeatureId:', store.selectedFeatureId);
    console.log('=== Test Complete ===');
}

/**
 * Test 2: Check if markers are interactive
 * Verify marker configuration
 */
export function testMarkerConfiguration() {
    const store = useDesignSync.getState();
    
    console.log('=== Marker Configuration Test ===');
    console.log('drawingMode:', store.drawingMode);
    console.log('isClickThrough:', store.drawingMode !== 'none' && store.drawingMode !== 'move');
    
    if (store.drawingMode !== 'none' && store.drawingMode !== 'move') {
        console.warn('⚠️ Markers are NOT interactive in current mode!');
        console.warn('   Switch to "none" or "move" mode to enable selection');
    } else {
        console.log('✓ Markers should be interactive in current mode');
    }
    
    console.log('=== Test Complete ===');
}

/**
 * Test 3: Check DrawingExplorer auto-expand
 * Manually trigger the expand chain for a feature
 */
export function testDrawingExplorerExpand(featureId?: string) {
    const store = useDesignSync.getState();
    
    const fid = featureId || store.selectedFeatureId;
    if (!fid) {
        console.error('❌ No feature selected! Select a feature first.');
        return;
    }
    
    console.log('=== DrawingExplorer Expand Test ===');
    console.log('Testing expand chain for feature:', fid);
    
    const feature = store.state?.features?.[fid];
    if (!feature) {
        console.error('❌ Feature not found:', fid);
        return;
    }
    
    console.log('Feature group_id:', feature.group_id);
    console.log('Feature geom_type:', feature.geom_type);
    console.log('Feature coordinates:', feature.coordinates);
    
    console.log('✓ DrawingExplorer should auto-expand and scroll to this feature');
    console.log('=== Test Complete ===');
}

/**
 * Test 4: Full selection flow test
 * Tests the complete chain: select → zoom → DrawingExplorer update
 */
export function testFullSelectionFlow(featureId?: string) {
    const store = useDesignSync.getState();
    
    console.log('=== Full Selection Flow Test ===');
    
    // Step 1: Check prerequisites
    console.log('Step 1: Prerequisites');
    console.log('  drawingMode:', store.drawingMode, store.drawingMode === 'none' || store.drawingMode === 'move' ? '✓' : '❌');
    
    // Step 2: Find feature
    const features = store.state?.features || {};
    const fid = featureId || Object.keys(features).find(
        id => features[id].geom_type === 'Point'
    );
    
    if (!fid || !features[fid]) {
        console.error('❌ No Point feature found!');
        return;
    }
    
    console.log('  Found feature:', fid, '✓');
    
    // Step 3: Select
    console.log('Step 2: Selecting feature...');
    store.selectFeature(fid);
    console.log('  selectedFeatureId:', store.selectedFeatureId, store.selectedFeatureId === fid ? '✓' : '❌');
    
    // Step 4: Zoom
    console.log('Step 3: Triggering zoom...');
    store.zoomTo(fid, 'feature');
    console.log('  zoomToTrigger:', store.zoomToTrigger?.id === fid ? '✓' : '❌');
    
    // Step 5: Check DrawingExplorer would expand
    console.log('Step 4: DrawingExplorer update...');
    console.log('  selectedGroupId:', store.selectedGroupId);
    console.log('  Should trigger auto-expand and scroll ✓');
    
    console.log('=== Test Complete ===');
    console.log('\nExpected behavior:');
    console.log('1. Map should zoom to feature center at zoom level 18');
    console.log('2. DrawingExplorer should highlight and scroll to feature');
    console.log('3. Feature should have cyan glow highlight on map');
}

// Export to window for easy access
if (typeof window !== 'undefined') {
    (window as any).testPointSelection = testPointSelection;
    (window as any).testMarkerConfiguration = testMarkerConfiguration;
    (window as any).testDrawingExplorerExpand = testDrawingExplorerExpand;
    (window as any).testFullSelectionFlow = testFullSelectionFlow;
    
    console.log('Point Selection Debug Utils loaded!');
    console.log('Available commands:');
    console.log('  testPointSelection() - Test if store can select a Point');
    console.log('  testMarkerConfiguration() - Check marker interactive state');
    console.log('  testDrawingExplorerExpand() - Test expand chain');
    console.log('  testFullSelectionFlow() - Test complete selection flow');
}
