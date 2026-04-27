# Current Storage Architecture & Optimization Plan

> **Analysis Date:** 2026-04-12  
> **Based on:** Actual source code review of all `.rs` files  
> **Scope:** Storage functionality, metadata coordination, lock prevention

---

## Table of Contents

1. [Current Storage Architecture](#1-current-storage-architecture)
2. [Data Flow: UI to Disk](#2-data-flow-ui-to-disk)
3. [Metadata Coordination](#3-metadata-coordination)
4. [Lock Prevention Mechanisms](#4-lock-prevention-mechanisms)
5. [Verified Facts vs Claims](#5-verified-facts-vs-claims)
6. [Optimization Recommendations](#6-optimization-recommendations)

---

## 1. Current Storage Architecture

### 1.1 Storage Layers (Verified)

```
┌──────────────────────────────────────────────────────────────────┐
│                        Application Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Design Map  │  │  Task Panel  │  │  File/Contract Panel   │ │
│  │  (React UI)  │  │  (React UI)  │  │  (React UI)            │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘ │
│         │                 │                     │               │
│         └─────────────────┴─────────────────────┘               │
│                           │                                      │
│                    Tauri Commands                                │
│         dispatch_design_event / dispatch_design_events           │
│         create_task / update_task / save_project                 │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│                     In-Memory State                               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    MapState (design_events/state.rs)        │  │
│  │                                                             │  │
│  │  DashMap<String, RegionState>       -- regions             │  │
│  │  DashMap<String, LayerState>        -- layers              │  │
│  │  DashMap<String, FeatureGroupState> -- feature_groups      │  │
│  │  DashMap<String, FeatureState>      -- features            │  │
│  │  ArcSwap<MapSettings>               -- settings (lock-free)│  │
│  │  ArcSwap<String>                    -- last_event_id       │  │
│  │  RwLock<RTree<SpatialFeature>>      -- spatial_index       │  │
│  │  RwLock<RTree<SpatialSegment>>      -- road_segments       │  │
│  │  DashMap<String, bool>              -- dirty_ids           │  │
│  │  DashMap<String, SpatialFeature>    -- spatial_map         │  │
│  │  DashMap<String, Vec<SpatialSegment>> -- road_map          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│              apply_event() / apply_event_no_index()               │
│              get_effective_metadata() (inheritance)               │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│                    Persistence Layer                               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              execute_immediate_sync() (db/mod.rs)           │  │
│  │                                                             │  │
│  │  1. Acquire write_conn mutex (serializes ALL writes)       │  │
│  │  2. BEGIN IMMEDIATE transaction                            │  │
│  │  3. For each event:                                         │  │
│  │     a. Generate UUID event_id                               │  │
│  │     b. Serialize to JSON payload_json                       │  │
│  │     c. INSERT INTO design_events                            │  │
│  │     d. apply_event_to_structural_tables() ← side effect     │  │
│  │        → work_items upsert                                  │  │
│  │        → metadata inheritance merge                         │  │
│  │  4. COMMIT                                                  │  │
│  │  5. On "database is locked": retry up to 10x (50ms*N)      │  │
│  │  6. Emit sync-status to frontend (0/1/2)                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│            write_conn (dedicated write connection)                │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│                    Storage Layer                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │               .pmp File (SQLite Database)                   │  │
│  │                                                             │  │
│  │  PRAGMA journal_mode = WAL                                  │  │
│  │  PRAGMA synchronous = NORMAL                                │  │
│  │  PRAGMA foreign_keys = ON                                   │  │
│  │  PRAGMA temp_store = MEMORY                                 │  │
│  │  PRAGMA cache_size = -64000  (64MB)                        │  │
│  │  PRAGMA mmap_size = 268435456  (256MB)                     │  │
│  │                                                             │  │
│  │  Tables: 31 total (projects, files, tasks, design_events,  │  │
│  │  design_snapshots, work_items, materials, content_*, etc.) │  │
│  │                                                             │  │
│  │  FTS5: file_search, task_search, note_search               │  │
│  │                                                             │  │
│  │  WAL file (.pmp-wal) -- auto-managed by SQLite             │  │
│  │  SHM file (.pmp-shm) -- shared memory for WAL              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│         DuckDB (Analytics - separate process)                    │
│         ┌──────────────────────────────────────┐                │
│         │  In-memory DuckDB per query           │                │
│         │  INSTALL sqlite; LOAD sqlite;         │                │
│         │  ATTACH 'project.pmp' AS project_db   │                │
│         │     (TYPE SQLITE)                     │                │
│         │  → Read-only scans of .pmp file       │                │
│         │  → BOM summary, custom queries        │                │
│         └──────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Database Connections (3-Connection Model)

**File:** `src-tauri/src/IMPLEMENT/db/models.rs` + `db/mod.rs`

| Connection | Type | Purpose | Concurrency |
|------------|------|---------|-------------|
| `conn` | `Arc<Mutex<Option<Connection>>>` | Primary read (hydration, queries) | Exclusive via Mutex |
| `write_conn` | `Arc<Mutex<Option<Connection>>>` | Dedicated write (event sync) | Exclusive via Mutex |
| `connection_pool` | `DashMap<PathBuf, Arc<Mutex<Connection>>>` | Additional read connections for cold hydration | Per-path, concurrent |

**Connection Setup (`setup_connection()`):**
```rust
fn setup_connection(conn: &mut Connection) -> Result<(), String> {
    conn.busy_timeout(Duration::from_secs(30))?;  // 30s wait before "locked" error
    conn.execute_batch("
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        PRAGMA temp_store = MEMORY;
        PRAGMA cache_size = -64000;
        PRAGMA mmap_size = 268435456;
    ")?;
    Ok(())
}
```

### 1.3 What Does NOT Exist

| Claim | Reality |
|-------|---------|
| RocksDB as high-speed buffer | ❌ **Does not exist** in codebase. Listed in `Cargo.toml` but zero usage in `.rs` files |
| Persistence Worker / worker.rs | ❌ **Does not exist**. Events go directly from Tauri command → `execute_immediate_sync()` |
| mpsc channel batching for design events | ❌ **Does not exist** for design events. `dispatch_design_event` calls sync directly. Only exists in Actor pipeline (v2) and CloudSync |
| `json_patch()` for incremental updates | ❌ **Does not exist**. Manual recursive `merge_json()` in `state.rs` |
| Multi-window sync | ❌ **Does not exist**. Single shared `MapState` via Tauri `State<'_>` |
| Shadow Copy / Double Buffering | ❌ **Does not exist** at DB level. MapState serves as in-memory buffer |

---

## 2. Data Flow: UI to Disk

### 2.1 Design Event Flow (GIS Changes)

```
1. USER INTERACTION (Frontend)
   └─ User draws/modifies feature on map
   └─ React component updates local useState

2. ZUSTAND STORE (Frontend)
   └─ User clicks "Save" or auto-save triggers
   └─ Store updates optimistic state in RAM
   └─ Store constructs DesignEvent objects:
        { type: "FeatureCreated", payload: { layer_id, name, geom_type, geometry, properties } }

3. IPC DISPATCH (Frontend → Backend)
   └─ invokeDesignEventBatch({ project_id, events: [...] })
   └─ OR invokeDesignEvent({ project_id, event: {...} })

4. TAURI COMMAND (Backend - Rust)
   └─ dispatch_design_events(state, project_id, events)
      File: DESIGN/design_events/mod.rs:476

   Step A: Validate project_id
   Step B: Apply events to in-memory MapState
      - If events.len() > 50: use apply_event_no_index() (batch mode)
        → Updates DashMaps directly, skips RTree updates per-event
      - If events.len() <= 50: use apply_event() per event
        → Updates DashMaps + RTree per event
   Step C: Calculate side effects
      - Camera auto-rotation (nearest road alignment)
      - Line segmentation (crossing polygons)
      - Topology propagation (BFS through snap_links)
   Step D: Rebuild spatial index (if batch mode)
      - Single pass collect all features → bulk-load RTree
   Step E: Sync to database
      - execute_immediate_sync(app_handle, state, project_id, &events)

5. EXECUTE IMMEDIATE SYNC (Backend - Rust)
   └─ execute_immediate_sync()
      File: IMPLEMENT/db/mod.rs:231

   Step A: Set sync_status = 1 (syncing), emit Tauri event
   Step B: Retry loop (max 10 retries, 50ms * N backoff)
      └─ execute_immediate_sync_internal():
         a. Lock write_conn mutex (SERIALIZES ALL WRITES)
         b. BEGIN IMMEDIATE transaction
         c. For each event:
            i.   Generate UUID event_id
            ii.  Serialize event to payload_json
            iii. INSERT INTO design_events (event_id, project_id, event_type, payload_json)
            iv.  apply_event_to_structural_tables(tx, project_id, event)
                 → work_items upsert/delete
                 → metadata inheritance merge
         d. COMMIT
   Step C: On success: sync_status = 0, return last_event_id
   Step D: On error after retries: sync_status = 2, return error

6. SIDE EFFECT: apply_event_to_structural_tables()
   └─ File: IMPLEMENT/db/logic.rs

   For FeatureCreated/Updated with material_id in properties:
      a. Fetch project metadata_json
      b. Merge project metadata → feature properties (merge_json)
      c. UPSERT work_items:
         INSERT INTO work_items (project_id, feature_id, name, material_id,
           quantity, unit_price, total_price, metadata_json)
         VALUES (...)
         ON CONFLICT(feature_id) DO UPDATE SET ...
   For FeatureDeleted:
      a. DELETE FROM work_items WHERE feature_id = ?

7. SQLITE DISK WRITE
   └─ WAL mode: writes go to .pmp-wal file first
   └─ Checkpoint: WAL pages merged into main .pmp file periodically
   └─ On close: PRAGMA wal_checkpoint(TRUNCATE)
```

### 2.2 Task/Contract/File Data Flow

```
1. USER INTERACTION (Frontend)
   └─ Create/edit task, contract, file, etc.

2. TAURI COMMAND (Backend - Rust)
   └─ commands/task.rs: create_task(), update_task(), delete_task()
   └─ commands/project.rs: save_project()
   └─ commands/contract.rs: create_contract(), etc.

3. DIRECT DATABASE OPERATION
   └─ Acquire conn or write_conn mutex
   └─ Execute SQL (INSERT/UPDATE/DELETE)
   └─ Release mutex
   └─ Return result to frontend

Note: Tasks, contracts, files use DIRECT SQL, not event-sourced.
Only GIS design changes go through the event-sourcing path.
```

### 2.3 Hydration (Load Project) Flow

```
1. invokeLoadProject({ db_path })
2. open_project_db(state, db_path)
   a. Open connection, apply schema
   b. Read project record
   c. Initialize 3 connections
3. load_design_state({ project_id })
   File: DESIGN/design_events/mod.rs:534

   Fast path:
      └─ If hydrated_project_id == requested_id: return cached state
   Cache path:
      └─ Check state_cache DashMap for MapState
   Cold path (fallback):
      a. Get connection from pool (NOT main conn)
      b. Fetch design_snapshots row for project_id
      c. Deserialize state_json → MapState (outside DB lock)
      d. If no snapshot: replay design_events from DB
         → Fetch events ordered by timestamp
         → apply_event_no_index() for each (batch mode)
         → Rebuild spatial index once at end
      e. Cache result in state_cache
4. Return MapState to frontend
```

---

## 3. Metadata Coordination

### 3.1 Metadata Storage Locations

| Location | Column | Purpose |
|----------|--------|---------|
| `projects` | `metadata_json` | Project-level metadata (contract info, custom fields) |
| `files` | `metadata_json` | AI analysis results, ContractMetadata cached |
| `work_items` | `metadata_json` | Feature analysis metadata (merged from project + feature) |
| `design_events` | `payload_json` | Serialized event data (contains feature properties) |
| `design_snapshots` | `state_json` | Full MapState (includes all metadata in memory) |
| `roles` | `permissions_json` | RBAC permissions |
| `content_items` | `data_json` | Dynamic content data |
| `audit_logs` | `old_values_json`, `new_values_json` | Audit deltas |

### 3.2 Metadata Inheritance Chain

**File:** `src-tauri/src/DESIGN/design_events/state.rs` → `get_effective_metadata()`

```
Project Settings (metadata_json)
    ↓ merge_json()
Feature Group Metadata (metadata_json)
    ↓ merge_json()
Feature Properties (properties field in FeatureState)
    ↓ applied at write time
work_items.metadata_json (merged result stored)
```

**Implementation in `state.rs`:**
```rust
pub fn get_effective_metadata(&self, feature_id: &str) -> serde_json::Value {
    // 1. Start with settings (global defaults)
    let mut merged = self.settings.load().clone();

    // 2. Find feature's group and merge group metadata
    if let Some(group) = self.feature_groups.get(feature_id) {
        merged = merge_json(merged, group.value().metadata.clone());
    }

    // 3. Merge feature-specific properties
    if let Some(feature) = self.features.get(feature_id) {
        merged = merge_json(merged, feature.value().properties.clone());
    }

    merged
}
```

**Implementation in `logic.rs` (`apply_event_to_structural_tables`):**
```rust
// At write time, project metadata is fetched and merged
let project_meta: String = tx.query_row(
    "SELECT COALESCE(metadata_json, '{}') FROM projects WHERE id = ?",
    params![project_id],
    |r| r.get(0)
).unwrap_or_else(|_| "{}".to_string());

let project_meta: serde_json::Value = serde_json::from_str(&project_meta).unwrap_or(json!({}));
let merged = merge_json(project_meta, feature_properties);

// Store merged result in work_items
tx.execute("INSERT INTO work_items ... metadata_json = ?", params![merged.to_string()]);
```

### 3.3 `merge_json()` Function

**File:** `src-tauri/src/DESIGN/design_events/state.rs`

Manual recursive JSON merge (NOT `json_patch`):

```rust
fn merge_json(base: serde_json::Value, overlay: serde_json::Value) -> serde_json::Value {
    match (base, overlay) {
        (serde_json::Value::Object(mut b), serde_json::Value::Object(o)) => {
            for (k, v) in o {
                if let Some(existing) = b.get(&k) {
                    b.insert(k, merge_json(existing.clone(), v));
                } else {
                    b.insert(k, v);
                }
            }
            serde_json::Value::Object(b)
        }
        (_, overlay) => overlay,  // Overlay wins for non-objects
    }
}
```

### 3.4 Single-Edit, Multi-Update

When a project-level metadata field is edited:
1. Frontend calls `save_project()` command
2. Backend executes: `UPDATE projects SET metadata_json = ? WHERE id = ?`
3. **No automatic cascade** to existing `work_items` or `files`
4. New work_items created AFTER the edit will inherit the new metadata
5. Existing work_items retain their snapshot of merged metadata at creation time

This is **eventual consistency** through event replay: if MapState is rebuilt from events, it picks up the latest project metadata.

---

## 4. Lock Prevention Mechanisms

### 4.1 What Currently Exists

#### WAL Mode (Write-Ahead Logging)
```sql
PRAGMA journal_mode = WAL;        -- Readers don't block writers, writers don't block readers
PRAGMA synchronous = NORMAL;      -- Only sync WAL frame, not main db (faster, safe enough)
```

**Effect:** Multiple readers can access the database while a writer is writing. The writer writes to `.pmp-wal` file first. Readers see consistent snapshots via `.pmp-shm` shared memory file.

#### Dedicated Write Connection with Mutex
```rust
write_conn: Arc<Mutex<Option<Connection>>>
```

**Effect:** All writes are serialized through a single mutex. No two write transactions can start simultaneously. This prevents writer-writer conflicts.

#### Immediate Transaction with Retry
```rust
// db/mod.rs: execute_immediate_sync()
let tx = conn.transaction_with_behavior(
    rusqlite::TransactionBehavior::Immediate
)?;

// Retry loop:
loop {
    match execute_immediate_sync_internal(...) {
        Ok(last_id) => return Ok(last_id),
        Err(e) if e.contains("database is locked") && retry_count < 10 => {
            retry_count += 1;
            std::thread::sleep(Duration::from_millis(50 * retry_count as u64));
            // 50ms, 100ms, 150ms, ..., 500ms (total max wait: ~2.75s)
        }
        Err(e) => return Err(e),
    }
}
```

**Effect:** If the database is busy (another connection holds a lock), the system retries up to 10 times with linear backoff instead of failing immediately.

#### Busy Timeout
```rust
conn.busy_timeout(Duration::from_secs(30))?;
```

**Effect:** SQLite will wait up to 30 seconds before returning "database is locked" error. Combined with the retry loop, this gives up to ~32.75 seconds total wait time.

#### Separate Connection Pool for Hydration
```rust
connection_pool: DashMap<PathBuf, Arc<Mutex<Connection>>>
```

**Effect:** Cold hydration (replaying events from DB) uses a pool connection, not the main `conn`. This prevents hydration from blocking other read operations.

#### Batch Mode for Large Event Sets
```rust
if events.len() > 50 {
    // Batch mode: apply_event_no_index() for all events
    // → Skip RTree updates per-event
    // → Rebuild spatial index once at end
    apply_event_no_index(&mut state, &event)?;
} else {
    apply_event(&mut state, &event)?;
}
```

**Effect:** Reduces write time for large batches by avoiding per-event spatial index rebuilds.

#### WAL Checkpoint on Close
```rust
conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", [])?;
```

**Effect:** Ensures WAL file is merged into main database on project close, preventing WAL file from growing indefinitely.

### 4.2 What Does NOT Exist (Gaps)

| Mechanism | Status | Impact |
|-----------|--------|--------|
| Exponential backoff | ❌ Uses **linear** backoff (50ms * N) | Less effective under sustained contention |
| RocksDB write buffer | ❌ Not implemented | All writes go directly to SQLite |
| Worker thread queue | ❌ Not implemented | Writes happen synchronously in Tauri command |
| Incremental metadata updates (json_patch) | ❌ Full JSON overwrite | Larger I/O for small changes |
| Shadow copy for frontend | ❌ Not implemented | Frontend may see stale data during sync |
| Multi-device conflict resolution | ❌ Not implemented | Single-user, single-window only |
| Optimistic concurrency control | ❌ No version checking | Last write wins for direct SQL operations |

### 4.3 Lock Scenarios and Current Behavior

| Scenario | What Happens | Outcome |
|----------|-------------|---------|
| UI saves while DuckDB queries | DuckDB reads main file, UI writes to WAL | ✅ No conflict (WAL mode) |
| Two windows save simultaneously | Second acquire of write_conn mutex waits | ✅ Serialized (Mutex) |
| Hydration runs while UI saves | Hydration uses pool connection, save uses write_conn | ✅ No conflict (separate connections) |
| Rapid-fire event saves | Retry loop catches "database is locked" | ✅ Retries up to 10x |
| Large batch save (500 events) | Batch mode skips per-event RTree rebuild | ✅ Faster write, single index rebuild |
| DuckDB query during heavy write | DuckDB may see WAL data or may block | ⚠️ Depends on SQLite state |
| App crash during write | WAL mode ensures atomic commit | ✅ No corruption |

---

## 5. Verified Facts vs Claims

### 5.1 Accurate Claims

| Claim | Verified | Evidence |
|-------|----------|----------|
| Primary storage is SQLite (.pmp) | ✅ | `db/mod.rs`, `db/schema.rs` |
| 3-Connection model (Read/Write/Pool) | ✅ | `db/models.rs`, `db/mod.rs:open_project_db()` |
| WAL mode enabled | ✅ | `setup_connection()` executes `PRAGMA journal_mode = WAL` |
| Immediate transactions | ✅ | `TransactionBehavior::Immediate` in `execute_immediate_sync_internal()` |
| Retry logic for locked database | ✅ | Retry loop in `execute_immediate_sync()` (10 retries, 50ms*N) |
| Event-sourcing for GIS | ✅ | `design_events` table, `dispatch_design_event` command |
| Metadata inheritance | ✅ | `merge_json()` in `state.rs`, applied in `logic.rs` |
| DuckDB for analytics via SQLite scanner | ✅ | `analytics/mod.rs` |
| Busy timeout 30s | ✅ | `conn.busy_timeout(Duration::from_secs(30))` |
| Batch mode for >50 events | ✅ | `dispatch_design_events` checks `events.len() > 50` |
| Snapshots for fast hydration | ✅ | `design_snapshots` table, `load_design_state()` |

### 5.2 Inaccurate Claims

| Claim | Reality | Location of Truth |
|-------|---------|-------------------|
| RocksDB as high-speed buffer | ❌ Not used at all | Zero matches in `.rs` files |
| Persistence Worker (worker.rs) | ❌ Does not exist | No "worker" patterns found |
| mpsc channel for design events | ❌ Direct sync, no queue | `dispatch_design_events` calls `execute_immediate_sync` directly |
| `json_patch()` for incremental updates | ❌ Manual recursive merge | `merge_json()` in `state.rs` |
| Multi-window sync | ❌ Not implemented | Single `MapState` via Tauri `State<'_>` |
| Shadow Copy / Double Buffering | ❌ Not at DB level | MapState serves as in-memory buffer only |
| Exponential backoff | ❌ Linear backoff (50ms * N) | `sleep(50 * retry_count)` |
| Cloud sync via Firebase | ⚠️ Stub only | `sync.rs` has scaffold, not wired |

---

## 6. Optimization Recommendations

### 6.1 Immediate Wins (Low Effort)

#### A. Exponential Backoff
**Current:** `sleep(50 * retry_count)` → 50, 100, 150, 200, ...ms  
**Recommended:** `sleep(50 * 2^(retry_count-1))` → 50, 100, 200, 400, 800, ...ms

```rust
// db/mod.rs: execute_immediate_sync()
let sleep_ms = 50 * (1 << (retry_count - 1));  // Exponential: 50, 100, 200, 400, ...
std::thread::sleep(Duration::from_millis(sleep_ms as u64));
```

**Impact:** Better handling of sustained contention. Total max wait: ~25.5s (vs 2.75s currently).

#### B. Reduce WAL File Size
**Current:** WAL grows unbounded between checkpoints  
**Recommended:** Set WAL auto-checkpoint threshold

```rust
// In setup_connection():
conn.execute("PRAGMA wal_autocheckpoint = 1000", [])?;  // Checkpoint every 1000 pages
```

**Impact:** Prevents WAL file from growing large, reduces checkpoint time on close.

#### C. Optimize FTS5 Triggers
**Current:** FTS5 tables updated manually per-operation  
**Recommended:** Use contentless FTS5 with triggers (like V2 entity_index)

```sql
-- Instead of manual INSERT INTO file_search...
CREATE TRIGGER files_fts_ai AFTER INSERT ON files BEGIN
    INSERT INTO file_search(rowid, file_path, title, content)
    VALUES (new.rowid, new.path, new.filename, new.content_summary);
END;
```

**Impact:** Eliminates manual FTS management, ensures consistency.

### 6.2 Medium Effort

#### D. Write Queue with Debounce
```rust
// New module: IMPLEMENT/db/write_queue.rs
pub struct WriteQueue {
    tx: mpsc::Sender<Vec<DesignEventType>>,
}

impl WriteQueue {
    pub fn enqueue(&self, events: Vec<DesignEventType>) {
        // Debounce: wait 100ms for more events, then flush
    }

    pub fn start_worker(state: Arc<DatabaseState>) -> Self {
        let (tx, mut rx) = mpsc::channel(100);
        tokio::spawn(async move {
            while let Some(events) = rx.recv().await {
                // Debounce: collect more events for 100ms
                let mut batch = events;
                let timeout = tokio::time::sleep(Duration::from_millis(100));
                tokio::pin!(timeout);
                while let Ok(more) = tokio::time::timeout(
                    Duration::from_millis(50), rx.recv()
                ).await {
                    if let Some(more) = more {
                        batch.extend(more);
                    }
                }
                // Flush batch
                execute_immediate_sync(..., &batch).await;
            }
        });
        Self { tx }
    }
}
```

**Impact:** Batches rapid-fire events into single transactions, reduces lock contention.

#### E. Incremental Metadata Updates
Instead of full JSON overwrite:

```rust
// In apply_event_to_structural_tables():
// Only update changed fields
tx.execute(
    "UPDATE work_items SET metadata_json = json_patch(metadata_json, ?) WHERE feature_id = ?",
    params![delta_json, feature_id],
)?;
```

**Impact:** Smaller I/O for small changes, reduced lock hold time.

#### F. Reader-Writer Lock for MapState
Replace DashMap with a single RwLock for the entire MapState:

```rust
// Current: DashMap per collection (fine-grained but complex)
// Alternative: Single RwLock<MapState>
map_state: Arc<RwLock<MapState>>,
```

**Impact:** Simpler concurrency model. Readers acquire read lock (concurrent), writer acquires write lock (exclusive). Trade-off: less parallelism for simplicity.

### 6.3 High Effort (Architecture Changes)

#### G. True Event Sourcing for ALL Entities
Currently only GIS events are event-sourced. Tasks, contracts, files use direct SQL.

**Recommendation:** Migrate to V2 EventStore (already implemented in `modules/v2/`) where ALL changes go through events.

**Impact:** Full audit trail, time-travel queries, conflict resolution for multi-device.

#### H. Multi-Device Sync Engine
Implement the V2 SyncEngine (already scaffolded in `modules/v2/sync/`):

- Push/pull events to server
- Offline queue
- Conflict detection (version vectors)
- Device ID tracking

**Impact:** Enables multi-device, multi-user scenarios.

#### I. Blob Storage for File Attachments
Currently files stored by path. Migrate to SHA-256 content-addressable storage (already implemented in `modules/v2/storage/blob_store.rs`):

- Deduplication
- Integrity verification
- Sync-friendly

**Impact:** Reduced storage, reliable file references.

---

## Summary

### What Works Well Today
1. ✅ WAL mode prevents reader-writer blocking
2. ✅ 3-connection model isolates read/write/hydration
3. ✅ Immediate transaction with retry handles transient locks
4. ✅ Batch mode optimizes large event sets
5. ✅ Snapshot-based hydration for fast project loading
6. ✅ Metadata inheritance chain (Settings → Group → Feature)
7. ✅ DuckDB analytics without impacting main database

### Gaps to Address
1. ❌ No RocksDB buffer (direct SQLite writes only)
2. ❌ No write queue (synchronous per-request)
3. ❌ Linear backoff (not exponential)
4. ❌ No incremental metadata updates (full JSON overwrite)
5. ❌ No multi-device sync (single-user only)
6. ❌ Only GIS is event-sourced (tasks/files use direct SQL)

### Priority Recommendations
| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| 🔴 P0 | Exponential backoff | 5 min | High |
| 🔴 P0 | WAL auto-checkpoint | 2 min | Medium |
| 🟡 P1 | Write queue with debounce | 2 hours | High |
| 🟡 P1 | Incremental metadata (json_patch) | 4 hours | Medium |
| 🟢 P2 | Migrate to V2 EventStore | 2 weeks | Very High |
| 🟢 P2 | Multi-device sync engine | 4 weeks | Very High |
