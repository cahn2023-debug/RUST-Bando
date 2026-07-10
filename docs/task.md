# Task List: System Optimization Bando V2

- [x] Phase 1: Audit & Analysis
    - [x] Run `cargo clippy` & `tsc --noEmit`.
    - [x] Run orphan file scanner.
    - [x] Identify technical debt (naming, unused vars).
- [/] Phase 2: Backend Optimization
    - [x] Enable SQLite WAL mode & PRAGMAs.
    - [ ] Increase channel capacity in `lib.rs`.
    - [ ] Optimize `StorageWorker` (reduce Arc clones).
- [ ] Phase 3: Frontend & IPC Optimization
    - [ ] Implement debounce for `update_metadata_v2` in `designIpc.ts`.
    - [ ] Fix type errors in `featureMapping.ts`.
- [ ] Phase 4: GIS & Core
- [ ] Phase 5: Cleanup
- [ ] Phase 6: Verification
