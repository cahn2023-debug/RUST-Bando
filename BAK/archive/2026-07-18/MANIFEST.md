# Archive Manifest - 2026-07-18

## Reason

Moved high-confidence unused Rust AI files out of the live tree during the UI/UX and Design storage optimization pass.

Evidence:
- `src-tauri/src/domain/implement/modules/mod.rs` only declares `pub mod v2;`.
- `src-tauri/src/domain/implement/commands/mod.rs` only declares `pub mod v2;` and `pub mod v2_bridge;`.
- `src-tauri/src/lib.rs` does not register commands from `commands/ai.rs`.
- `rg "domain::implement::modules::ai|modules::ai|commands::ai|ai::" src-tauri/src src-tauri/crates` only found references inside the archived AI subtree itself.
- The cleanup dry-run also flagged this AI subtree as unreachable from the Rust module tree.

## Archived Files

- `src-tauri/src/domain/implement/commands/ai.rs`
- `src-tauri/src/domain/implement/modules/ai/actor.rs`
- `src-tauri/src/domain/implement/modules/ai/ml.rs`
- `src-tauri/src/domain/implement/modules/ai/mod.rs`
- `src-tauri/src/domain/implement/modules/ai/ai_engine/downloader.rs`
- `src-tauri/src/domain/implement/modules/ai/ai_engine/embedding.rs`
- `src-tauri/src/domain/implement/modules/ai/ai_engine/mod.rs`
- `src-tauri/src/domain/implement/modules/ai/ai_engine/ocr.rs`
- `src-tauri/src/domain/implement/modules/ai/ai_engine/phi3.rs`
- `src-tauri/src/domain/implement/modules/ai/ai_engine/qwen.rs`
- `src-tauri/src/domain/implement/modules/ai/ai_engine/self_heal.rs`
- `src-tauri/src/domain/implement/modules/ai/ai_engine/yolo.rs`

## Restore

To restore a file, move it back from `BAK/archive/2026-07-18/<original path>` to the same original relative path, then re-add the matching `pub mod ai;` or command registration if the AI feature is intentionally reactivated.
