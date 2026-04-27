# Debug Guide: Click Not Working

## 🔴 Problem

When clicking on features on the map, nothing happens:
- No feature selection
- No zoom
- No console logs
- No visual feedback

---

## 🔍 Root Cause Analysis

### Most Likely Cause: Stale Markers Without Event Handlers

**What Happened**:
1. Features were rendered **BEFORE** the latest code update
2. Existing markers in `markersMapRef.current` don't have the new click handlers
3. When you click, you're clicking on old markers without handlers

**How to Verify**:
```javascript
// Open Console (F12)
// Type this command:
const markers = document.querySelectorAll('.leaflet-marker-icon');
console.log(`Found ${markers.length} markers on the map`);

// If you see markers but clicking does nothing → stale markers issue
```

---

## ✅ Solutions

### Solution 1: Refresh the Page (RECOMMENDED)

**Steps**:
1. **Save** all code changes
2. **Stop** the development server (Ctrl+C)
3. **Restart** the server (`npm run dev` or `cargo tauri dev`)
4. **Refresh** the browser/app completely (Ctrl+Shift+R or Cmd+Shift+R)
5. **Open Console** (F12)
6. **Wait** for features to load
7. **Look for logs**:
   ```
   [PointLayer] Creating marker for feature abc123
   [PointLayer] Marker created and added to group for abc123
   ```
8. **Click** on a feature
9. **Expected logs**:
   ```
   [Point] Click on feature abc123, drawingMode: none
   [Selection] Selecting feature: abc123, group: group456
   [Selection] Feature abc123 selected, keepSelection: false
   [Selection] Triggering zoom to feature abc123
   [Zoom] Zooming to feature abc123 at zoom level 20
   ```

---

### Solution 2: Switch Drawing Mode

If refreshing doesn't help, try switching drawing modes to force marker updates:

**Steps**:
1. Click on **"VẼ"** (Draw) button in toolbar
2. Then click back on **"CHỌN"** (Select) button
3. Try clicking a feature again

**Why this works**: Switching modes may trigger marker recreation with new handlers.

---

### Solution 3: Check if Features are Actually Rendering

**Symptom**: No `[PointLayer] Creating marker` logs appear

**Possible Causes**:

#### A. Features not loading from database
```
Console shows: (empty)
Map shows: (no features)
```
**Fix**: Check if project is loaded correctly

#### B. Features rendering but no markers
```
Console shows: (some logs but no "Creating marker")
Map shows: (maybe lines/polygons but no points)
```
**Fix**: Check if `features` array is populated in PointLayer

#### C. Coordinates invalid
```
Console shows: (no "Creating marker" for specific features)
```
**Fix**: Check if features have valid `[lng, lat]` coordinates

---

## 🧪 Diagnostic Checklist

Run through this checklist in order:

### Step 1: Check Console on Load
```
Expected logs:
✅ [PointLayer] Creating marker for feature ...
✅ [PointLayer] Marker created and added to group for ...
```

**If NO logs**:
- Features not being passed to PointLayer
- Check if `state.features` is populated
- Check if `useDesignSync` state is initialized

### Step 2: Check Drawing Mode
```javascript
// In Console, type:
useDesignSync.getState().drawingMode
```

**Expected**: `'none'` or `'move'`  
**If something else**: Switch to "CHỌN" mode

### Step 3: Click Test
1. Click on a marker
2. Check Console

**Expected**:
```
[Point] Click on feature abc123, drawingMode: none
[Selection] Selecting feature: abc123, group: group456
...
```

**If NO logs**:
- Event handlers not attached
- Markers are stale
- **Solution**: Refresh the page

**If "Click blocked" log**:
```
[Point] Click on feature abc123, drawingMode: draw_line
[Point] Click blocked - drawingMode is 'draw_line'
```
- Drawing mode is not 'none' or 'move'
- **Solution**: Switch to "CHỌN" mode

### Step 4: Check if Marker is Interactive
```javascript
// In Console, type:
const markers = document.querySelectorAll('.leaflet-marker-icon');
markers.forEach((m, i) => {
    console.log(`Marker ${i}:`, m.style.pointerEvents);
});
```

**Expected**: `pointerEvents` should NOT be `'none'`  
**If `'none'`**: Drawing mode is blocking clicks

---

## 🔧 Quick Fix Commands

### Force Re-render All Markers
```javascript
// In Console (F12):
const state = useDesignSync.getState();
// Trigger state update to force re-render
useDesignSync.setState({ state: { ...state } });
```

### Check Features Count
```javascript
// In Console:
const state = useDesignSync.getState();
console.log('Total features:', Object.keys(state.features || {}).length);
console.log('Features:', state.features);
```

### Check Current Drawing Mode
```javascript
// In Console:
console.log('Drawing mode:', useDesignSync.getState().drawingMode);
```

### Manually Select a Feature
```javascript
// In Console (replace 'YOUR_FEATURE_ID' with actual ID):
const state = useDesignSync.getState();
const featureId = 'YOUR_FEATURE_ID';

// Select it
state.selectFeature(featureId, false);
state.setSelectedGroup(state.features[featureId]?.group_id);
state.zoomTo(featureId, 'feature');
```

---

## 📊 Expected Behavior After Fix

### When Clicking a Point Feature:

1. **Console logs**:
   ```
   [Point] Click on feature abc123, drawingMode: none
   [Selection] Selecting feature: abc123, group: group456
   [Selection] Feature abc123 selected, keepSelection: false
   [Selection] Triggering zoom to feature abc123
   [Zoom] Zooming to feature abc123 at zoom level 20
   ```

2. **Visual feedback**:
   - Marker gets cyan glow border
   - Marker scales up (1.1x)
   - Popup appears above marker

3. **Map behavior**:
   - Smooth zoom animation to level 20
   - Feature centered on screen

4. **Project Explorer**:
   - Feature highlighted in tree (emerald background)
   - Auto-scrolls to feature in viewport

---

## 🚨 Common Mistakes

### ❌ Mistake 1: Not Refreshing After Code Changes
**Problem**: Old markers still in memory without new handlers  
**Solution**: Full page refresh (Ctrl+Shift+R)

### ❌ Mistake 2: Wrong Drawing Mode
**Problem**: In "Vẽ đường" or "Vẽ vùng" mode  
**Solution**: Switch to "CHỌN" mode first

### ❌ Mistake 3: Clicking Background Instead of Feature
**Problem**: Clicking between markers, not ON them  
**Solution**: Click directly on the marker icon

### ❌ Mistake 4: Features Not Loaded Yet
**Problem**: Clicking before features render  
**Solution**: Wait for features to appear on map

---

## 📝 Summary

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| No logs at all | Stale markers / not refreshed | **Refresh page** |
| "Click blocked" | Wrong drawing mode | Switch to "CHỌN" |
| "Selection blocked" | Drawing mode not 'none' | Switch to "CHỌN" |
| Selection logs but no zoom | Invalid coordinates | Check feature data |
| Zoom logs but no movement | Map.setView fails | Check Leaflet instance |

---

**Created**: April 11, 2026  
**Status**: Debug mode enabled with comprehensive logging
