# Implementation Log: Vertex Editing Data Sync Fix

**Date**: 2026-03-19
**Feature**: Polyline Vertex Editing
**Issue**: Data was not saving due to `SyntaxError` in `JSON.parse`.

## 🛠️ Changes
- **`useDesignSync.ts`**:
    - Refactored `setDrawingPoint` and `insertDrawingPoint` to use `getParsedCoordinates` instead of direct `JSON.parse`.
    - Added case-insensitive check for `LINESTRING` and `POLYLINE` in `dispatchEvent` physics calculation.
    - Ensured coordinate payloads are correctly stringified for Rust storage.
- **Inherited Components**:
    - `getParsedCoordinates` from `featureUtils.ts`.
    - `dispatchEvent` architecture.
- **Snapping Fix (2026-03-19)**:
    - Centralized snapping in `useSnap` hook.
    - Fixed stale closures in event handlers using `useRef`.
    - Added real-time snapping to `VertexEditor`.
    - Corrected `start_node_id` and `end_node_id` metadata persistence.

## ✅ Verification
- **Test Case**: `src/stores/__tests__/vertex_fix.test.ts`
- **Results**: Passed (3/3 tests).
- **Regression Registry**: Added "Vertex Coordinate Parsing" feature.

## 🧠 Lessons Learned
- Don't assume the type of `feature.coordinates` in the Zustand store. It might be pre-parsed by the Tauri bridge or Firestore listener. Use safe utility functions like `getParsedCoordinates` consistently.
