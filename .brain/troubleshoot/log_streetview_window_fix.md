# Troubleshoot Log: Street View Window Not Opening & Marker Misplaced

**Date**: 2026-03-15
**Issue**: 
1. Cửa sổ Street View không mở khi click vào bản đồ (mặc dù đã bật chế độ Street View).
2. Biểu tượng Pegman (hình người) hiển thị bị lệch khỏi tâm vị trí click.

## Virtual Council Analysis

### Security Sentinel
- CSP in `tauri.conf.json` may need verification if external frames are blocked, but the primary window creation depends on frontend permissions.
- Capabilities are already set in `capabilities/default.json`.

### Performance Prophet
- Dynamic import of `@tauri-apps/api/webviewWindow` is done locally.
- Marker position mismatch could be a rendering lag or anchor issue.

### Logic Lord
- **Marker Misplacement**: Detected redundant translation. `L.divIcon` uses `iconAnchor: [11, 28]` which already offsets the icon center-bottom to the coordinate. The inner `div` has `transform: translate(-11px, -28px)` which applies the offset a second time.
- **Window Not Opening**: URL passed to `WebviewWindow` might be problematic if relative. Current: `?view=streetview...`.

### System Architect
- Routing in `main.tsx` relies on `window.location.search`.
- Need to ensure `WebviewWindow` is visible upon creation.
- Check if `map.on('click')` is correctly bound when `isActive` toggles.

## Consensus & Solution
1. **Fix Marker**: Remove `transform: translate(-11px, -28px)` from `pegmanMarkerIcon` in `StreetViewControl.tsx`. Rely solely on `iconAnchor`.
2. **Debug Window**: Add logs to `openStreetViewWindow`, `main.tsx`, and `StreetViewPage.tsx` to track the lifecycle of the new window.
3. **Verify URL**: Ensure the URL correctly triggers the conditional rendering in `main.tsx`.

## Implementation Strategy
- Update `StreetViewControl.tsx` (Marker + Logs).
- Update `main.tsx` (Logs).
- Update `StreetViewPage.tsx` (Logs).
