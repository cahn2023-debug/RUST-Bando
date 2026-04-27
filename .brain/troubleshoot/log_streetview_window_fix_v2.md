# Troubleshoot Log: Street View Window Visibility Failure (Deep Dive)

**Date**: 2026-03-15
**Issue**: Cửa sổ Street View vẫn không hiển thị dù đã click vào bản đồ.

## Virtual Council Analysis

### Security Sentinel
- Tauri v2 permissions are "Deny by Default". We added `core:webview:default` and `core:window:allow-create`, but maybe we need `core:webview:allow-create-webview-window` (if using a newer plugin) or explicitly allow the label in the capability.
- Check if CSP is blocking the initial URL load `?view=streetview`.

### Performance Prophet
- The window might be created but in a "hidden" state. In Tauri v2, windows might not be automatically shown if created via JS without explicit `visible: true`.

### Logic Lord
- In `StreetViewControl.tsx`, `webview = new WebviewWindow(...)`. 
- Potential issue: The URL `?view=streetview...` might be resolving to `http://localhost:1420?view=streetview`.
- Wait, I used `webview.once('tauri://created', ...)` but didn't call `webview.show()`.
- Also, checking `WebviewWindow.getByLabel(label)` might return an object that isn't fully ready to emit if it was just closed.

### System Architect
- Tauri v2 configuration for `windows` in `tauri.conf.json` is missing the `street-view` label definition. Although JS can create it, defining it in `tauri.conf.json` with `visible: false` and then showing it might be more stable.
- Recommendation: Use absolute URL or ensure the current origin is included.
- Crucial: In Tauri v2, you often need to call `webview.show()` or ensure `visible: true` is in options.

## Consensus & Solution
1. **Explicit Visibility**: Set `visible: true` in the `WebviewWindow` constructor options.
2. **Absolute URL Check**: Use `window.location.origin + url` to be 100% sure.
3. **Permissions refinement**: Add `core:webview:allow-create-webview-window` to be safe if that's what the v2 JS API expects.
4. **Label synchronization**: Ensure the main window has a label if we are referencing windows by labels.

## Implementation Strategy
- Update `StreetViewControl.tsx` with `visible: true` and absolute URL.
- Try one more time to update `tauri.conf.json` with proper label.
- Add `core:window:allow-show` (if not already there).
