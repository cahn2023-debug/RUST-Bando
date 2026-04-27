# /plan - Android Sync Fix

## Phase -1: Context Check
- **User Request**: "Dù đã chung ID nhưng dữ liệu trên android vẫn chưa đồng bộ" (Even with same ID, Android data is not synced).
- **Core Observation**: 
  - Desktop displays many features on the map.
  - Desktop Sync Status says "Cloud Synced" (no pending writes).
  - Android HUD displays "Cloud Synced (0)" meaning it received an empty `features` map from Firestore.
- **Root Cause Analysis**: 
  - On the Desktop app (`useDesignSync.ts`), `initialize()` fetches the local CAD data (`load_design_state` from SQLite/Rust) into the frontend state but **NEVER automatically pushes this initial loaded state up to Firestore**.
  - `pushStateToFirestore` is currently *only* invoked when a user explicitly performs an action (like drawing a point or moving an object via `dispatchEvent`).
  - Therefore, the Firestore document `design_projects/1213` stays empty (or contains 0 features) until a local modification is explicitly made.

## Phase 0: Socratic Gate
1. **Did I understand the I/O?** Yes. Android reads Firestore. Desktop writes to Firestore but lacks the trigger to push its loaded read-only DWG imports.
2. **Any risks to current files?** Adding an auto-sync on load might upload huge payloads (DWG > 1MB) which could crash Firestore's 1MB document limit. We need a manual "Force Sync" button or a smart delta push. Considering the UI already has a "Đồng bộ" (Sync) button in the `ConstructionFAB` on Android and we might need one on Desktop.
3. **Environment concerns?** Firestore limit is 1 MiB per document. If we have 10,000 points, we must be careful.

## Proposed Task Breakdown

### 1. Fix Desktop Unidirectional Sync Trigger
**Problem**: Desktop loads from SQLite but doesn't share this read state with Firestore.
**Solution**:
- Expose a `forceSyncToCloud` method inside `useDesignSync.ts` that triggers `pushStateToFirestore(projectId, get().state)`.
- Add a "Sync to Cloud" button to the Desktop UI (e.g., inside the `Toolbar` or as part of the `SyncStatusLayer` when clicked).

### 2. Safeguard Firebase 1MB Limit (Future-proofing)
**Problem**: Large CAD files will break the 1MB Firestore limit if stored as a single document.
**Solution (Optional but recommended)**:
- Filter the `MapState` to only push features that are relevant to mobile (e.g., omit raw unneeded CAD layers, only sync user-generated points and important polylines). 
- *For this specific fix*, we will implement a basic `forceSyncToCloud` and check if the payload fits.

### 3. Verify Android Parsing
**Problem**: Android might fail to cast generic lists.
**Solution**:
- Add verbose logging (`Log.d("DesignSync")`) in `DesignSyncRepository.kt` to dump the size of `data["features"]` raw object.
- Ensure the ViewModel correctly passes `hasPendingWrites` to avoid false "Cloud Synced" statuses on Android.

## Agent Assignments
- **Antigravity Agent (Code Mode)**: Implement `forceSyncToCloud` in Zustand and add a UI trigger in React. Update Android logging if necessary to verify payload arrival.

## Verification Checklist
- [ ] Open Desktop App, load project 1213.
- [ ] Click the new "Force Sync" button.
- [ ] Open Android App, verify the "Cloud Synced (0)" turns into "Cloud Synced (X)" where X is > 0.
- [ ] Markers should appear on the Android map view.
