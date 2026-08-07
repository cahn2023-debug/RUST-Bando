# PLAN-pmp-v1-audit

## Goal
Perform a comprehensive audit of the RUST-BANDO project to remove V1 legacy code, implement stress testing scenarios, and optimize the storage/rendering layers as specified in `PROJECT_OVERVIEW - Check.md`.

## Phase -1: Context Check
- [x] Read `KNOWNS.md`
- [x] Read `PROJECT_OVERVIEW - Check.md`
- [x] Initial codebase search for V1 residue

## Phase 0: Socratic Gate
1. **Ambiguity**: Should I delete the `BAK/` directory files immediately if they contain V1 code, or move them to a different location?
2. **Environment**: Are there any hardware-specific constraints for the AI memory stress tests (e.g., target RAM is 2GB as mentioned in the doc)?
3. **Safety**: Should I create a full backup of the current `.pmp` project files before running the cleanup scripts?

## Phase 1: V1 Residue Audit (Audit & Cleanup)
- [ ] Run grep scripts for: `V1ToV2Migrator`, `v1_schema`, `legacy_pmp`, `old_event_store`, `migration_v1`, `EventV1`, `ProjectMetaV1`, `v1_compat`, `legacy_migration`.
- [ ] Inspect `src-tauri/tools/legacy_migration/` and determine if it should be removed.
- [ ] Check `src-tauri/src/domain/implement/modules/v2/storage/schema.rs` for any lingering V1 column references.
- [ ] Identify and deprecate/remove `#[cfg(v1)]` blocks.

## Phase 2: QA Scenarios (Testing)
- [ ] Implement Database Locking stress test (multiple instances simulation).
- [ ] Implement AI Memory Overhead test (simulated low RAM).
- [ ] Implement Renderer Lag test (>10k features).
- [ ] Setup `github-actions.yml` with cross-platform build matrix.

## Phase 3: Metadata Quality Control
- [ ] Implement `/metadata-audit` script to detect junk strings.
- [ ] Integrate cleanup logic with `analyze_all_project_files`.

## Phase 4: Scaling & Optimization
- [ ] Review `wgpu` instanced drawing for GIS features.
- [ ] Implement WAL auto-checkpointing in SQLite.
- [ ] Add explicit `drop()` for WASM heap objects where missing.

## Verification Checklist
- [ ] `cargo test` passes.
- [ ] `grep "v1"` (case-insensitive) shows only modern usage (e.g., in `db_v2.rs`).
- [ ] `.pmp` file schema verified via `sqlite3` or Python script.
