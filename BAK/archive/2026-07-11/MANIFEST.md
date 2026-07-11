# Cleanup archive manifest

This archive contains files moved out of the active codebase on 2026-07-11 during the first implementation pass of the cleanup plan.

Criteria used in this pass:

- No active import or module-tree reference from production entrypoints
- Experimental or broken WASM/AI paths removed from the default runtime
- Deprecated debug exports removed from the shipped bundle
- Standalone subsystems explicitly approved for archive

Archived items in this pass:

- `financial_system/`
- `src-tauri/design_renderer/`
- `src-tauri/streetview_wasm/`
- `src-tauri/src/bin/ai_benchmark.rs`
- `src-tauri/src/domain/implement/commands/ai_learning.rs`
- `src-tauri/src/domain/implement/modules/bootstrap.rs`
- `src-tauri/src/domain/implement/modules/v2/projections/`
- `src/modules/design/features/map/Palette/Earth3DView.tsx`
- `src/modules/design/features/map/Palette/GoogleEarthIframe.tsx`
- `src/modules/design/features/map/Palette/StreetViewRenderer.ts`
- `src/modules/design/features/map/Palette/StreetViewWasm.tsx`
- `src/modules/design/features/map/PointSelectionDebug.ts`
- `src/modules/implement/hooks/useWasmRenderer.ts`
- `src/modules/implement/lib/design_renderer.d.ts`
- `src/modules/implement/lib/design_renderer.js`
- `src/modules/implement/lib/design_renderer_bg.js`
- `src/modules/implement/lib/design_renderer_bg.wasm`
- `src/modules/implement/lib/design_renderer_bg.wasm.d.ts`
- `src/modules/implement/lib/package.json`
- `src/file_list_full.txt`
